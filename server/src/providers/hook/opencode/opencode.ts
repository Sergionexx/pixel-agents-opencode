import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentEvent, HookProvider } from '../../../../../core/src/provider.js';
import {
  BASH_COMMAND_DISPLAY_MAX_LENGTH,
  TASK_DESCRIPTION_DISPLAY_MAX_LENGTH,
} from '../../../constants.js';
import { OPCODE_TERMINAL_NAME_PREFIX } from './constants.js';

// ── formatToolStatus ──

function formatToolStatus(toolName: string, input?: unknown): string {
  const inp = (input ?? {}) as Record<string, unknown>;
  const base = (p: unknown) => (typeof p === 'string' ? path.basename(p) : '');
  switch (toolName) {
    case 'read':
      return `Reading ${base(inp.filePath ?? inp.file_path)}`;
    case 'edit':
    case 'write':
      return `Writing ${base(inp.filePath ?? inp.file_path)}`;
    case 'bash': {
      const cmd = (inp.command as string) || '';
      return `Running: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '\u2026' : cmd}`;
    }
    case 'glob':
      return 'Searching files';
    case 'grep':
      return 'Searching code';
    case 'todowrite':
      return 'Updating tasks';
    case 'webfetch':
      return 'Fetching web content';
    case 'websearch':
      return 'Searching the web';
    case 'task':
    case 'agent': {
      const desc =
        typeof inp.description === 'string'
          ? inp.description
          : typeof inp.prompt === 'string'
            ? inp.prompt
            : '';
      return desc
        ? `Subtask: ${desc.length > TASK_DESCRIPTION_DISPLAY_MAX_LENGTH ? desc.slice(0, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH) + '\u2026' : desc}`
        : 'Running subtask';
    }
    case 'askuserquestion':
    case 'question':
      return 'Waiting for your answer';
    case 'pencil_batch_design':
    case 'pencil_batch_get':
    case 'pencil_export_nodes':
    case 'pencil_get_editor_state':
    case 'pencil_get_guidelines':
    case 'pencil_get_screenshot':
    case 'pencil_get_variables':
    case 'pencil_set_variables':
    case 'pencil_snapshot_layout':
      return 'Editing design assets';
    case 'unityMCP_':
      return 'Interacting with Unity';
    default:
      return `Using ${toolName}`;
  }
}

// ── normalizeHookEvent: synthetic events from DB poller ──
//
// The OpenCode DB poller generates synthetic hook events with the format:
//   { hook_event_name: 'opencode:toolStart', session_id: 'ses_...', ... }
// The provider normalizes them into AgentEvent shapes.

function normalizeHookEvent(
  raw: Record<string, unknown>,
): { sessionId: string; event: AgentEvent } | null {
  const eventName = raw.hook_event_name;
  const sessionId = raw.session_id;
  if (typeof eventName !== 'string' || typeof sessionId !== 'string') return null;

  // Only handle opencode-prefixed synthetic events
  if (!eventName.startsWith('opencode:')) return null;

  const kind = eventName.slice('opencode:'.length);

  switch (kind) {
    case 'toolStart': {
      const toolName = typeof raw.tool_name === 'string' ? raw.tool_name : '';
      const toolInput =
        typeof raw.tool_input === 'object' && raw.tool_input !== null
          ? (raw.tool_input as Record<string, unknown>)
          : {};
      return {
        sessionId,
        event: {
          kind: 'toolStart',
          toolId: `opencode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          toolName,
          input: toolInput,
          runInBackground: toolInput.run_in_background === true,
        },
      };
    }

    case 'toolEnd': {
      const toolId = typeof raw.tool_id === 'string' ? raw.tool_id : '';
      if (!toolId) return null;
      return { sessionId, event: { kind: 'toolEnd', toolId } };
    }

    case 'turnEnd':
      return { sessionId, event: { kind: 'turnEnd' } };

    case 'sessionStart':
      return {
        sessionId,
        event: {
          kind: 'sessionStart',
          source: typeof raw.source === 'string' ? raw.source : undefined,
          transcriptPath: undefined, // OpenCode has no transcript file
          cwd: typeof raw.cwd === 'string' ? raw.cwd : undefined,
        },
      };

    case 'sessionEnd':
      return {
        sessionId,
        event: {
          kind: 'sessionEnd',
          reason: typeof raw.reason === 'string' ? raw.reason : undefined,
        },
      };

    default:
      return null;
  }
}

// ── Launch command ──

function buildLaunchCommand(
  _sessionId: string,
  cwd: string,
  _opts?: { bypassPermissions?: boolean },
): { command: string; args: string[]; env?: Record<string, string> } {
  // OpenCode has no --session-id flag. The binary is looked up via PATH,
  // or from ~/.opencode/bin/opencode as fallback.
  const command = findOpenCodeBinary();
  return { command, args: [], env: { PWD: cwd } };
}

function findOpenCodeBinary(): string {
  const candidates = ['opencode', path.join(os.homedir(), '.opencode', 'bin', 'opencode')];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* fall through */
    }
  }
  return 'opencode'; // Let PATH resolve it
}

// ── Session DB path ──

export function getOpenCodeDbPath(): string {
  // Prioritize XDG_DATA_HOME, fall back to ~/.local/share
  const xdgData = process.env.XDG_DATA_HOME;
  const dataDir = xdgData ? path.join(xdgData, 'opencode') : path.join(os.homedir(), '.local', 'share', 'opencode');
  return path.join(dataDir, 'opencode.db');
}

// ── Provider ──

export const opencodeProvider: HookProvider = {
  kind: 'hook',
  id: 'opencode',
  displayName: 'OpenCode',
  protocolVersion: 1,

  normalizeHookEvent,

  // OpenCode has no hook system — install/uninstall are no-ops.
  installHooks: async () => {},
  uninstallHooks: async () => {},
  areHooksInstalled: async () => false,

  formatToolStatus,
  permissionExemptTools: new Set(['task', 'agent', 'askuserquestion', 'question', 'todowrite']),
  subagentToolNames: new Set(['task', 'agent']),
  readingTools: new Set([
    'read',
    'grep',
    'glob',
    'webfetch',
    'websearch',
    'pencil_batch_get',
    'pencil_get_editor_state',
    'pencil_get_guidelines',
    'pencil_get_screenshot',
    'pencil_get_variables',
    'pencil_snapshot_layout',
  ]),
  terminalNamePrefix: OPCODE_TERMINAL_NAME_PREFIX,

  // No session directories (OpenCode uses SQLite, not JSONL files)
  getSessionDirs: () => [],
  getAllSessionRoots: () => [],

  // No file-based session pattern
  sessionFilePattern: undefined,

  // No transcript line parsing (DB-based, not file-based)
  parseTranscriptLine: undefined,

  buildLaunchCommand,

  // No team support for OpenCode (no Agent Teams feature)
  team: undefined,
};


