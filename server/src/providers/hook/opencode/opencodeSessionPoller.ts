import { execFileSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';

import {
  OPCODE_DB_POLL_INTERVAL_MS,
  OPCODE_HOOK_EVENT_PREFIX,
  OPCODE_INITIAL_SCAN_WINDOW_MS,
} from './constants.js';
import { getOpenCodeDbPath } from './opencode.js';

// ── Types ──

interface OpenCodePart {
  id: string;
  session_id: string;
  message_id: string;
  time_created: number;
  data: string; // JSON string
}

interface OpenCodeSession {
  id: string;
  directory: string;
  agent: string;
  time_updated: number;
}

interface ParsedPart {
  type: string;
  tool?: string;
  callID?: string;
  state?: {
    status?: string;
    input?: Record<string, unknown>;
    output?: string;
  };
  reason?: string;
}

/** Tracks the state of a single opencode session for change detection. */
interface SessionState {
  sessionId: string;
  directory: string;
  agentType: string;
  latestPartTime: number;
  latestToolPartTime: number;
  activeToolId: string | null;
  activeToolName: string | null;
  activeToolInput: Record<string, unknown> | null;
  activeToolStartTime: number;
  hasUnfinishedTurn: boolean;
}

/** Event callback types for the poller. */
export interface OpenCodeEventCallback {
  (providerId: string, event: Record<string, unknown>): void;
}

// ── Poller ──

export class OpenCodeSessionPoller {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private sessions = new Map<string, SessionState>();
  private knownSessionIds = new Set<string>();
  private workspaceDir: string;
  private callback: OpenCodeEventCallback;
  private dbPath: string;

  constructor(workspaceDir: string, callback: OpenCodeEventCallback) {
    this.workspaceDir = workspaceDir;
    this.callback = callback;
    this.dbPath = getOpenCodeDbPath();
  }

  /** Start polling the OpenCode database for session changes. */
  start(): void {
    // Initial scan for existing sessions
    this.pollOnce();

    // Start periodic polling
    this.pollTimer = setInterval(() => {
      this.pollOnce();
    }, OPCODE_DB_POLL_INTERVAL_MS);
  }

  /** Stop polling and release resources. */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.sessions.clear();
    this.knownSessionIds.clear();
  }

  /** Register a session ID we already know about (e.g., from a terminal we launched). */
  registerSession(sessionId: string): void {
    this.knownSessionIds.add(sessionId);
  }

  /** Unregister a session ID (e.g., when its agent is closed). */
  unregisterSession(sessionId: string): void {
    this.knownSessionIds.delete(sessionId);
    this.sessions.delete(sessionId);
  }

  // ── Polling Logic ──

  private pollOnce(): void {
    try {
      const sessions = this.querySessions();
      const now = Date.now();

      for (const sess of sessions) {
        if (!this.knownSessionIds.has(sess.id)) {
          this.handleNewSession(sess);
        }
        this.emitIfChanged(sess, now);
      }

      // Clean up stale sessions that no longer exist
      for (const [id] of this.sessions) {
        if (!sessions.some((s) => s.id === id)) {
          this.handleSessionEnd(id);
        }
      }
    } catch (err) {
      console.error(`[Pixel Agents] OpenCode poll error: ${err}`);
    }
  }

  private emitIfChanged(sess: OpenCodeSession, _now: number): void {
    const prev = this.sessions.get(sess.id);
    if (!prev) return;

    const parts = this.queryLatestParts(sess.id, prev.latestPartTime);

    for (const part of parts) {
      let parsed: ParsedPart;
      try {
        parsed = JSON.parse(part.data) as ParsedPart;
      } catch {
        continue;
      }

      if (parsed.type === 'tool' && parsed.tool) {
        const toolName = parsed.tool;
        const callID = parsed.callID ?? '';
        const status = parsed.state?.status ?? 'completed';
        const input = parsed.state?.input ?? {};

        if (status === 'running' && callID) {
          // Tool just started running
          if (callID !== prev.activeToolId) {
            // End previous tool if still active
            if (prev.activeToolId) {
              this.emitToolEnd(sess.id, prev.activeToolId);
            }

            prev.activeToolId = callID;
            prev.activeToolName = toolName;
            prev.activeToolInput = input;
            prev.activeToolStartTime = part.time_created;
            prev.hasUnfinishedTurn = true;
            this.emitToolStart(sess.id, toolName, input);
          }
        } else if (status === 'completed' && callID && prev.activeToolId === callID) {
          // Tool completed
          prev.activeToolId = null;
          prev.activeToolName = null;
          prev.activeToolInput = null;
          this.emitToolEnd(sess.id, callID);
        }
      } else if (parsed.type === 'step-finish') {
        // Turn complete
        if (prev.activeToolId) {
          this.emitToolEnd(sess.id, prev.activeToolId);
          prev.activeToolId = null;
          prev.activeToolName = null;
          prev.activeToolInput = null;
        }
        prev.hasUnfinishedTurn = false;
        this.emitTurnEnd(sess.id);
      }

      prev.latestPartTime = Math.max(prev.latestPartTime, part.time_created);
      if (parsed.type === 'tool') {
        prev.latestToolPartTime = Math.max(prev.latestToolPartTime, part.time_created);
      }
    }

    // Update session-level time
    prev.latestPartTime = Math.max(prev.latestPartTime, sess.time_updated);
  }

  private handleNewSession(sess: OpenCodeSession): void {
    this.knownSessionIds.add(sess.id);

    // Emit sessionStart
    this.callback('opencode', {
      hook_event_name: `${OPCODE_HOOK_EVENT_PREFIX}sessionStart`,
      session_id: sess.id,
      cwd: sess.directory,
      source: 'new',
    });

    // Initialize tracking state
    const latestParts = this.queryLatestParts(sess.id, 0);
    let latestPartTime = sess.time_updated;
    let latestToolPartTime = 0;

    for (const part of latestParts) {
      if (part.time_created > latestPartTime) latestPartTime = part.time_created;
      try {
        const parsed = JSON.parse(part.data) as ParsedPart;
        if (parsed.type === 'tool') {
          latestToolPartTime = Math.max(latestToolPartTime, part.time_created);
        }
      } catch {
        /* skip unparseable */
      }
    }

    this.sessions.set(sess.id, {
      sessionId: sess.id,
      directory: sess.directory,
      agentType: sess.agent,
      latestPartTime,
      latestToolPartTime,
      activeToolId: null,
      activeToolName: null,
      activeToolInput: null,
      activeToolStartTime: 0,
      hasUnfinishedTurn: false,
    });
  }

  private handleSessionEnd(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    if (state.activeToolId) {
      this.emitToolEnd(sessionId, state.activeToolId);
    }
    this.emitSessionEnd(sessionId);

    this.sessions.delete(sessionId);
    this.knownSessionIds.delete(sessionId);
  }

  // ── Event Emitters ──

  private emitToolStart(sessionId: string, toolName: string, input: Record<string, unknown>): void {
    this.callback('opencode', {
      hook_event_name: `${OPCODE_HOOK_EVENT_PREFIX}toolStart`,
      session_id: sessionId,
      tool_name: toolName,
      tool_input: input,
    });
  }

  private emitToolEnd(sessionId: string, toolId: string): void {
    this.callback('opencode', {
      hook_event_name: `${OPCODE_HOOK_EVENT_PREFIX}toolEnd`,
      session_id: sessionId,
      tool_id: toolId,
    });
  }

  private emitTurnEnd(sessionId: string): void {
    this.callback('opencode', {
      hook_event_name: `${OPCODE_HOOK_EVENT_PREFIX}turnEnd`,
      session_id: sessionId,
    });
  }

  private emitSessionEnd(sessionId: string): void {
    this.callback('opencode', {
      hook_event_name: `${OPCODE_HOOK_EVENT_PREFIX}sessionEnd`,
      session_id: sessionId,
      reason: 'exit',
    });
  }

  // ── DB Queries ──

  /** Query sessions matching our workspace directory, ordered by most recently updated. */
  private querySessions(): OpenCodeSession[] {
    // Normalize the directory path for the query (escape single quotes)
    const dir = this.workspaceDir.replace(/'/g, "''");

    // Query sessions for this directory, including recently active ones
    const cutoff = Date.now() - OPCODE_INITIAL_SCAN_WINDOW_MS;
    const sql = `SELECT id, directory, agent, time_updated FROM session WHERE directory = '${dir}' AND time_updated >= ${cutoff} ORDER BY time_updated DESC`;
    const result = this.execDbQuery(sql);
    try {
      return JSON.parse(result) as OpenCodeSession[];
    } catch {
      return [];
    }
  }

  /** Query parts for a session that are newer than a given timestamp. */
  private queryLatestParts(sessionId: string, sinceTime: number): OpenCodePart[] {
    const sid = sessionId.replace(/'/g, "''");
    const sql = `SELECT id, session_id, message_id, time_created, data FROM part WHERE session_id = '${sid}' AND time_created > ${sinceTime} ORDER BY time_created ASC`;
    const result = this.execDbQuery(sql);
    try {
      return JSON.parse(result) as OpenCodePart[];
    } catch {
      return [];
    }
  }

  /** Execute a SQL query against the OpenCode database via the CLI. */
  private execDbQuery(sql: string): string {
    const dbPath = this.dbPath;
    const homeDir = os.homedir();

    // Use sqlite3 directly for better performance (already installed on macOS).
    // Fall back to `opencode db` if sqlite3 is not available.
    try {
      const result = this.execSync('sqlite3', [dbPath, sql]);
      if (result !== null) return result;
    } catch {
      /* fall through to opencode db */
    }

    // Fallback: opencode db command
    try {
      const result = this.execSync(
        path.join(homeDir, '.opencode', 'bin', 'opencode'),
        ['db', '--format', 'json', sql],
      );
      if (result !== null) return result;
    } catch {
      /* fall through to error */
    }

    // Second fallback: opencode from PATH
    try {
      const result = this.execSync('opencode', ['db', '--format', 'json', sql]);
      if (result !== null) return result;
    } catch {
      /* fall through */
    }

    return '[]';
  }

  /** Run a command synchronously and return stdout, or null on failure. */
  private execSync(cmd: string, args: string[]): string | null {
    try {
      const result = execFileSync(cmd, args, {
        encoding: 'utf-8',
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      // If sqlite3 returns TSV, convert first line (headers) = strip
      // If JSON, return as-is
      const trimmed = result.trim();
      if (!trimmed) return '[]';
      // Check if it looks like JSON (starts with [)
      if (trimmed.startsWith('[')) return trimmed;
      // TSV from sqlite3: parse it
      return this.parseSqliteTsv(trimmed);
    } catch {
      return null;
    }
  }

  /** Parse TSV output from sqlite3 into a JSON array. */
  private parseSqliteTsv(tsv: string): string {
    const lines = tsv.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return '[]';

    // First line is headers
    const headers = lines[0].split('\t');
    const result: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length && j < values.length; j++) {
        row[headers[j]] = values[j];
      }
      result.push(row);
    }

    return JSON.stringify(result);
  }
}
