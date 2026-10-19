export type SessionStatus = 'running' | 'waiting' | 'ended'

export type StatusReason =
  | 'new'
  | 'reply'
  | 'interrupted'
  | 'error'
  | 'permission'
  | 'question'
  | 'input'
  | (string & {})

/**
 * One session's record: `~/.claude/standup/sessions/<id>.json`, written only
 * by that session's own process.
 */
export type SessionRecord = {
  version: 1
  id: string
  title: string
  /** The git repo root (main checkout for a worktree), else the project root. */
  groupKey: string
  cwd: string
  /** The desktop app's own id for the session (`local_…`), when it has one. */
  hostSessionId?: string
  status: SessionStatus
  reason?: StatusReason
  startedAt: number
  lastActivityAt: number
  heartbeatAt: number
  endedAt?: number
}

/**
 * A manual column override: `~/.claude/standup/overrides/<id>.json`, written
 * only by the board.
 */
export type Override = {
  review: boolean
  at: number
}

export type Prefs = {
  /** The environment (group key) last viewed; `all` for every one. */
  env: string
  showEmpty: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'standup-board': {
      sessions: SessionRecord[]
      overrides: Record<string, Override>
      now: number
      prefs: Prefs
      selected: string
    }
  }
}
