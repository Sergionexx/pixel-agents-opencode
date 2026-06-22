/**
 * OpenCode-specific constants.
 *
 * OpenCode stores sessions in a local SQLite database at
 * `~/.local/share/opencode/opencode.db` and provides `opencode export <sessionID>`
 * for retrieving full session transcripts as JSON.
 */

export const OPCODE_TERMINAL_NAME_PREFIX = 'OpenCode';

/** Path to the OpenCode SQLite database (session store). */
export const OPCODE_DB_PATH = '.local/share/opencode/opencode.db';

/** Poll interval for checking the OpenCode database for session changes. */
export const OPCODE_DB_POLL_INTERVAL_MS = 1500;

/** How far back (ms) to scan for initial sessions on startup. */
export const OPCODE_INITIAL_SCAN_WINDOW_MS = 30_000;

/** Synthetic hook event names emitted by the OpenCode DB poller.
 *  These are prefixed so the provider's normalizeHookEvent can distinguish them
 *  from real hook events from other providers. */
export const OPCODE_HOOK_EVENT_PREFIX = 'opencode:';
