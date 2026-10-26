import { mock } from 'claude-code/testing'
import type { On, SessionRepo, UiPane } from 'claude-code'

import type { Override, SessionRecord } from '../types'

export const HOME = '/Users/tester'
export const SESSIONS = `${HOME}/.claude/standup/sessions`
export const OVERRIDES = `${HOME}/.claude/standup/overrides`
export const NOW = Date.UTC(2026, 9, 19, 9, 30)

export type World = {
  files: Map<string, string>
  /** Writes a file as another process would: its modification time moves on. */
  write: (path: string, text: string) => void
  toasts: string[]
  copies: string[]
  runs: string[][]
  opened: string[]
  writeCount: () => number
  store: Map<string, unknown>
  clock: ReturnType<typeof mock.clock>
  record: (id: string) => SessionRecord | undefined
  override: (id: string) => Override | undefined
}

export type WorldOptions = {
  sessionId?: string
  cwd?: string
  repo?: SessionRepo | null
  files?: Record<string, string>
  isPaneOpen?: boolean
  /** Whether the surface's own clipboard takes a copy (remote surfaces: no). */
  isClipboard?: boolean
  hostSessionId?: string
  /** The engine version `$.session.version()` answers; styled buttons need 2.1.299. */
  version?: string
  /** The transcript a session already holds when the mod loads into it. */
  history?: { role: 'user' | 'assistant'; text: string }[]
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'))

export const world = (on: On, options: WorldOptions = {}): World => {
  const files = new Map(Object.entries(options.files ?? {}))
  const mtimes = new Map<string, number>()
  let tick = 1
  let writes = 0
  for (const path of files.keys()) mtimes.set(path, tick++)
  const toasts: string[] = []
  const copies: string[] = []
  const runs: string[][] = []
  const opened: string[] = []
  const store = new Map<string, unknown>()
  const clock = mock.clock(on, { now: NOW })
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  mock.env(on, {
    HOME,
    ...(options.hostSessionId ? { CLAUDE_CODE_HOST_SESSION_ID: options.hostSessionId } : {}),
  })

  on('fs.list', ($, e) => {
    const entries = [...files.keys()]
      .filter(path => dirOf(path) === e.path)
      .map(path => ({
        name: path.slice(e.path.length + 1),
        kind: 'file' as const,
        size: files.get(path)?.length ?? 0,
        mtimeMs: mtimes.get(path) ?? 0,
        isLink: false,
      }))

    return { value: entries }
  })
  on('fs.read', ($, e) => {
    const text = files.get(e.path)
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('fs.stat', ($, e) => {
    const text = files.get(e.path)

    return text === undefined
      ? { deny: `ENOENT: ${e.path}` }
      : { value: { kind: 'file' as const, size: text.length, mtimeMs: mtimes.get(e.path) ?? 0, isLink: false } }
  })
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    mtimes.set(e.path, tick++)
    writes += 1

    return { value: undefined }
  })

  const cwd = options.cwd ?? '/Users/tester/code/api'
  on('session.id', () => ({ value: options.sessionId ?? 'sess-test' }))
  on('session.cwd', () => ({ value: cwd }))
  on('session.root', () => ({ value: cwd }))
  on('session.version', () => {
    const version = options.version ?? '2.1.308'

    return { value: { version, base: version } } as never
  })
  on('session.messages', () => ({
    value: (options.history ?? []).map(message => ({ ...message, toolUses: [] })),
  }) as never)
  on('session.repo', () => ({
    value:
      options.repo === undefined
        ? { root: cwd, remote: null, internal: false, name: null }
        : options.repo,
  }))

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: { text: 'ok' } }) as never)
  on('classic.SessionStart', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  on('classic.PermissionRequest', () => ({}))
  on('classic.PermissionDenied', () => ({}))
  on('classic.Elicitation', () => ({}))
  on('classic.ElicitationResult', () => ({}))

  const pane: UiPane = { id: 'standup', title: 'Standup', isShown: true, isFocused: false, isPlaced: true }
  on('ui.panes', () => ({ value: options.isPaneOpen ? [pane] : [] }))
  on('ui.open', ($, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('command.register', () => ({ value: { name: 'standup' } as never }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.copy', ($, e) => {
    if (!options.isClipboard) return { value: { isCopied: false, reason: 'no-clipboard' } }
    copies.push(e.text)

    return { value: { isCopied: true } }
  })
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    if (e.argv[0] === 'pbcopy') copies.push(e.init?.stdin ?? '')

    return {
      value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })

  const json = <T,>(path: string): T | undefined => {
    const text = files.get(path)

    return text === undefined ? undefined : (JSON.parse(text) as T)
  }

  return {
    files,
    write: (path, text) => {
      files.set(path, text)
      mtimes.set(path, tick++)
    },
    toasts,
    copies,
    runs,
    opened,
    writeCount: () => writes,
    store,
    clock,
    record: id => json<SessionRecord>(`${SESSIONS}/${id}.json`),
    override: id => json<Override>(`${OVERRIDES}/${id}.json`),
  }
}

export const paneProps = (bodyColumns: number) => ({
  title: 'Standup',
  isFocused: true,
  bodyColumns,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
})
