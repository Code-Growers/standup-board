// Every function that takes `$` lives in this file: Claude Code before 2.1.299
// follows `$` only into functions declared in the hooks module itself.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Override, Prefs, SessionRecord, SessionStatus, StatusReason } from '../types'
import {
  ALL,
  ago,
  buildBoard,
  clip,
  parseOverride,
  parseRecord,
  resumeCommand,
  statusText,
} from './board'
import type { Board, Card } from './board'
import { GLYPH, PALETTE, bar, buddy, isLively, moodColor, moodOf, rings } from './art'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await startTracker($)
    await startBoard($)

    return next(e)
  })

  // Also after /clear, resume and fork, where no `session.start` fires.
  on('classic.SessionStart', async ($, e, next) => {
    await load($)
    await setTitle($, e.session_title, true)
    await save($, true)

    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await setTitle($, e.session_title, true)
    if (!MACHINE_PROMPTS.has(e.source ?? 'user')) await setTitle($, e.prompt, false)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      // The first prompt titles a session that has no title of its own.
      await setTitle($, e.text, false)
      await mark($, 'running')
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const reason = e.reason === 'answer' ? 'reply' : e.reason === 'aborted' ? 'interrupted' : 'error'
      await mark($, 'waiting', reason)
    }

    return next(e)
  })

  // Records the status without waiting on it, so the prompt is never held up.
  on('classic.PermissionRequest', ($, e, next) => {
    void mark($, 'waiting', 'permission').catch(() => undefined)

    return next(e)
  })

  on('classic.Elicitation', async ($, e, next) => {
    await mark($, 'waiting', 'input')

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const isQuestion = String(e.tool) === 'AskUserQuestion'
    if (isQuestion) await mark($, 'waiting', 'question')
    const result = await next(e)
    if (isWaitingOnTool()) await mark($, 'running')
    else await touch($)

    return result
  })

  // A prompt answered without the tool finishing yet (a denial, an MCP form).
  on('classic.PermissionDenied', async ($, e, next) => {
    if (isWaitingOnTool()) await mark($, 'running')

    return next(e)
  })

  on('classic.ElicitationResult', async ($, e, next) => {
    if (isWaitingOnTool()) await mark($, 'running')

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const current = record?.id === e.sessionId ? record : await load($)
    const now = await $.clock.now()
    record = { ...current, status: 'ended', reason: e.reason, endedAt: now, lastActivityAt: now }
    await save($, true)
    record = undefined

    return next(e)
  })

  on('command.run', { command: 'standup' }, async $ => {
    const opened = await openBoard($)

    return {
      text: opened.isPlaced
        ? 'Standup board opened.'
        : `Standup board will show when there is room: ${opened.reason}`,
    }
  })

  on('ui.close', { id: PANE }, ($, e, next) => {
    stopPolling()

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    // The terminal's table still names Svg, drawn as nothing: ask the surface.
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? table.Svg : undefined
    const view = await read($, prefs)
    const time = (await read($, now)) || (await $.clock.now())
    const records = await read($, sessions)
    const result: Board = buildBoard({
      sessions: records,
      overrides: await read($, overrides),
      now: time,
      env: view.env,
      showEmpty: view.showEmpty,
    })
    const columns = Math.max(20, e.props.bodyColumns)
    const isWide = columns >= WIDE_COLUMNS
    const gap = 1
    const columnWidth = isWide ? Math.floor((columns - gap * 3) / 4) : columns
    const setEnv = (env: string) => savePrefs($, value => ({ ...value, env }))

    const card = (item: Card) => {
      const { record } = item
      const mood = moodOf(item, time)
      const color = moodColor(mood)
      const inner = Math.max(8, columnWidth - 4 - (Svg ? 7 : 2))
      const waited = (time - record.lastActivityAt) / 3_600_000
      const progress =
        mood === 'working' ? 'busy' : item.column === 'waiting' ? Math.min(1, waited) : undefined

      return (
        <Box
          key={`box:${record.id}`}
          flexDirection="column"
          borderStyle="round"
          borderColor={color}
          paddingX={1}
          width={columnWidth}
        >
          <Box flexDirection="row" columnGap={1}>
            {Svg ? (
              <Svg
                source={buddy(mood)}
                alt={statusText(item, time)}
                width={44}
                height={44}
                isInteractive={isLively(mood) || undefined}
              />
            ) : (
              <Text bold color={color}>
                {GLYPH[mood]}
              </Text>
            )}
            <Box flexDirection="column" flexGrow={1}>
              <Button
                key={`card:${record.id}`}
                plain
                label={clip(titleOf(record), inner)}
                onPress={press => copyResume($, record, press.surface)}
              />
              <Text>
                <Text dimColor>{clip(item.envLabel, Math.max(4, inner - 20))} · </Text>
                <Text color={color}>{statusText(item, time)}</Text>
              </Text>
              <Text dimColor>{clip(ago(record.lastActivityAt, time), inner)}</Text>
            </Box>
          </Box>
          {Svg && progress !== undefined && (
            <Svg
              source={bar(color, progress)}
              alt={progress === 'busy' ? 'Working' : `Waiting ${ago(record.lastActivityAt, time)}`}
              height={6}
              isInteractive={progress === 'busy' || undefined}
            />
          )}
          <Button
            key={`review:${record.id}`}
            plain
            dimColor
            label={item.isReview ? '↩ Out of review' : '→ Move to review'}
            onPress={() => toggleReview($, record.id)}
          />
        </Box>
      )
    }

    const tabs = () => (
      <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
        {[{ key: ALL, label: 'All', waiting: result.total.waiting }, ...result.environments].map(
          (tab, index) => (
            <Box key={`tab:${index}`} flexDirection="row" columnGap={1}>
              {tab.key === result.env ? (
                <Text bold underline color={PALETTE.accent}>
                  {tab.label}
                </Text>
              ) : (
                <Button key={`env:${index}`} plain dimColor label={tab.label} onPress={() => setEnv(tab.key)} />
              )}
              {tab.waiting > 0 && <Text color={PALETTE.waiting}>{tab.waiting}</Text>}
            </Box>
          ),
        )}
      </Box>
    )

    const toggle = () =>
      (result.hiddenEnvironments > 0 || view.showEmpty) && (
        <Button
          key="toggle-empty"
          plain
          dimColor
          label={
            view.showEmpty
              ? 'Hide environments with no active sessions'
              : `Show ${result.hiddenEnvironments} environment${result.hiddenEnvironments === 1 ? '' : 's'} with no active sessions`
          }
          onPress={() => savePrefs($, value => ({ ...value, showEmpty: !value.showEmpty }))}
        />
      )

    const column = (entry: Board['columns'][number]) => (
      <Box key={`col:${entry.id}`} flexDirection="column" width={columnWidth} rowGap={1}>
        <Text bold color={PALETTE[entry.id]}>
          ● {entry.title} ({entry.cards.length})
        </Text>
        {entry.cards.length === 0 ? (
          <Text dimColor>Nothing here</Text>
        ) : (
          entry.cards.map(card)
        )}
      </Box>
    )

    if (records.length === 0) {
      return (
        <Box flexDirection="column" rowGap={1}>
          <Text bold>No sessions yet</Text>
          <Text dimColor>
            Every session with standup-board installed shows up here once it starts. The board
            only sees sessions on this machine.
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" rowGap={1} width={columns}>
        {Svg ? (
          <Box key="gauges" flexDirection="row" alignSelf="flex-start">
            <Svg
              source={rings(
                result.columns.map(entry => ({
                  label: entry.id === 'waiting' ? 'WAITING' : entry.title.toUpperCase(),
                  count: entry.cards.length,
                  color: PALETTE[entry.id],
                })),
                result.columns.reduce((sum, entry) => sum + entry.cards.length, 0),
              )}
              alt={`${result.total.active} active, ${result.total.waiting} waiting for you`}
              width={288}
              height={74}
            />
          </Box>
        ) : (
          <Text key="summary">
            <Text color={PALETTE.running}>{result.total.active} active</Text>
            <Text dimColor> · </Text>
            <Text color={PALETTE.waiting}>{result.total.waiting} waiting for you</Text>
          </Text>
        )}
        {tabs()}
        {toggle()}
        <Box flexDirection={isWide ? 'row' : 'column'} columnGap={gap} rowGap={1}>
          {result.columns.map(column)}
        </Box>
      </Box>
    )
  })
}

async function stateDir($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''

  return `${home.replace(/[\\/]+$/, '')}/.claude/standup`
}

async function sessionsDir($: EngineInterface): Promise<string> {
  return `${await stateDir($)}/sessions`
}

async function overridesDir($: EngineInterface): Promise<string> {
  return `${await stateDir($)}/overrides`
}

const fileName = (id: string): string => `${id.replace(/[^\w-]/g, '')}.json`

const HEARTBEAT_MS = 60_000
/** Activity alone (no status change) is written at most this often. */
const ACTIVITY_WRITE_MS = 15_000

// This session's record, rebuilt from its file after a hot reload. A session
// writes only its own file, so sessions never race on one.
let record: SessionRecord | undefined
let lastWrite = { text: '', at: 0 }

async function load($: EngineInterface): Promise<SessionRecord> {
  const id = await $.session.id()
  if (record?.id === id) return record

  const path = `${await sessionsDir($)}/${fileName(id)}`
  const saved = await $.fs
    .read(path)
    .then(text => parseRecord(text))
    .catch(() => undefined)
  const now = await $.clock.now()
  const repo = await $.session.repo().catch(() => null)
  const cwd = await $.session.cwd()
  const hostSessionId = await $.env.get('CLAUDE_CODE_HOST_SESSION_ID')
  // Loaded into a session that already ran (an install, /reload-plugins): its
  // transcript gives the title and says it is waiting on a reply.
  const found = saved?.title ? [] : await $.session.messages().catch(() => [])
  const history = Array.isArray(found) ? found : []
  const firstPrompt = history.find(
    message => message.role === 'user' && message.text.trim() && !message.text.trimStart().startsWith('<'),
  )?.text
  const isLive = saved !== undefined && saved.status !== 'ended'

  record = {
    version: 1,
    id,
    title: saved?.title || clip(firstPrompt ?? '', 80),
    groupKey: repo?.root ?? (await $.session.root()),
    cwd,
    ...(hostSessionId ? { hostSessionId } : {}),
    status: isLive ? saved.status : 'waiting',
    reason: isLive ? saved.reason : history.length > 0 ? 'reply' : 'new',
    startedAt: saved?.startedAt ?? now,
    lastActivityAt: now,
    heartbeatAt: now,
  }
  lastWrite = { text: '', at: 0 }

  return record
}

async function save($: EngineInterface, force = false): Promise<void> {
  if (!record) return
  const now = await $.clock.now()
  // Activity and heartbeat stamps alone are not a change: they ride on the
  // next write, at most every ACTIVITY_WRITE_MS.
  const { heartbeatAt: _, lastActivityAt: __, ...rest } = record
  const text = JSON.stringify(rest)
  const isChanged = text !== lastWrite.text
  const isDue = now - lastWrite.at >= ACTIVITY_WRITE_MS
  if (!force && !isChanged && !isDue) return

  record = { ...record, heartbeatAt: now }
  lastWrite = { text, at: now }
  await $.fs.write(`${await sessionsDir($)}/${fileName(record.id)}`, JSON.stringify(record))
}

async function mark(
  $: EngineInterface,
  status: SessionStatus,
  reason?: StatusReason,
): Promise<void> {
  const current = await load($)
  const now = await $.clock.now()
  const { reason: _, ...rest } = current
  record = { ...rest, status, ...(reason ? { reason } : {}), lastActivityAt: now }
  await save($)
}

async function touch($: EngineInterface): Promise<void> {
  const current = await load($)
  record = { ...current, lastActivityAt: await $.clock.now() }
  await save($)
}

async function setTitle($: EngineInterface, title: string | undefined, isSessionTitle: boolean) {
  const text = clip(title ?? '', 80)
  if (!text) return
  const current = await load($)
  if (!isSessionTitle && current.title) return
  record = { ...current, title: text }
}

const isWaitingOnTool = (): boolean =>
  record?.status === 'waiting' &&
  (record.reason === 'permission' || record.reason === 'question' || record.reason === 'input')

const MACHINE_PROMPTS = new Set(['system', 'loop_wakeup', 'schedule_wakeup', 'poll_event'])

async function startTracker($: EngineInterface): Promise<void> {
  await load($)
  await save($, true)
  $.clock.every(HEARTBEAT_MS, () => {
    if (record?.status !== 'ended') void save($, true)
  })
}


const PANE = 'standup'
const TITLE = 'Standup'
const POLL_MS = 2_000
const CLOCK_STEP_MS = 30_000
/** Below this many columns the board stacks its columns instead of setting them side by side. */
const WIDE_COLUMNS = 88

const sessions = atom({ plugin: 'standup-board', key: 'sessions' } as const, [])
const overrides = atom({ plugin: 'standup-board', key: 'overrides' } as const, {})
const now = atom({ plugin: 'standup-board', key: 'now' } as const, 0)
const prefs = atom({ plugin: 'standup-board', key: 'prefs' } as const, {
  env: ALL,
  showEmpty: false,
})

type Cached<T> = { mtimeMs: number; size: number; value: T | undefined }

// Module caches: a hot reload starts them over and the next poll refills them.
const sessionCache = new Map<string, Cached<SessionRecord>>()
const overrideCache = new Map<string, Cached<Override>>()
let poll: { cancel: () => void } | undefined
let shown = { sessions: '', overrides: '', now: 0 }

/** Reads a folder's JSON files, rereading only those whose size or time changed. */
async function readFolder<T>(
  $: EngineInterface,
  dir: string,
  cache: Map<string, Cached<T>>,
  parse: (text: string) => T | undefined,
): Promise<T[]> {
  const entries = await $.fs.list(dir).catch(() => [])
  const names = new Set<string>()
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    names.add(entry.name)
    const held = cache.get(entry.name)
    if (held && held.mtimeMs === entry.mtimeMs && held.size === entry.size) continue
    const value = await $.fs
      .read(`${dir}/${entry.name}`)
      .then(parse)
      .catch(() => undefined)
    // A file caught mid-write parses as nothing: keep the last good value.
    cache.set(entry.name, {
      mtimeMs: entry.mtimeMs,
      size: entry.size,
      value: value ?? held?.value,
    })
  }
  for (const name of [...cache.keys()]) if (!names.has(name)) cache.delete(name)

  return [...cache.values()].flatMap(held => (held.value === undefined ? [] : [held.value]))
}

async function refresh($: EngineInterface): Promise<void> {
  const records = await readFolder($, await sessionsDir($), sessionCache, parseRecord)
  const overrideDir = await overridesDir($)
  await readFolder($, overrideDir, overrideCache, parseOverride)
  const byId: Record<string, Override> = {}
  for (const [name, held] of overrideCache) {
    if (held.value) byId[name.replace(/\.json$/, '')] = held.value
  }

  const sessionsText = JSON.stringify(records)
  if (sessionsText !== shown.sessions) {
    shown = { ...shown, sessions: sessionsText }
    await update($, sessions, () => records)
  }
  const overridesText = JSON.stringify(byId)
  if (overridesText !== shown.overrides) {
    shown = { ...shown, overrides: overridesText }
    await update($, overrides, () => byId)
  }
  const time = await $.clock.now()
  if (time - shown.now >= CLOCK_STEP_MS) {
    shown = { ...shown, now: time }
    await update($, now, () => time)
  }
}

async function startPolling($: EngineInterface): Promise<void> {
  if (poll) return
  shown = { sessions: '', overrides: '', now: 0 }
  await refresh($)
  poll = $.clock.every(POLL_MS, () => void refresh($))
}

function stopPolling(): void {
  poll?.cancel()
  poll = undefined
}

async function openBoard($: EngineInterface) {
  const opened = await $.ui.open({ id: PANE, title: TITLE })
  await startPolling($)

  return opened
}

async function savePrefs($: EngineInterface, change: (value: Prefs) => Prefs) {
  const value = await update($, prefs, change)
  await $.store.set('prefs', value)
}

async function toggleReview($: EngineInterface, id: string) {
  const current = (await read($, overrides))[id]
  const flag: Override = { review: !current?.review, at: await $.clock.now() }
  await $.fs.write(`${await overridesDir($)}/${fileName(id)}`, JSON.stringify(flag))
  await update($, overrides, all => ({ ...all, [id]: flag }))
}

/** The surface's clipboard first; on macOS, where a remote surface has none yet, pbcopy. */
async function copy($: EngineInterface, text: string, surface: RenderSurface) {
  const copied = await $.ui.copy({ text, surface }).catch(() => undefined)
  if (copied?.isCopied) return true
  const run = await $.process
    .run(['pbcopy'], { stdin: text, timeoutMs: 5_000 })
    .catch(() => undefined)

  return run?.exitCode === 0
}

async function copyResume($: EngineInterface, record: SessionRecord, surface: RenderSurface) {
  const isCopied = await copy($, resumeCommand(record), surface)
  $.ui.toast(
    isCopied
      ? 'Resume command copied: paste it in a terminal'
      : `Could not copy. Resume it with: ${resumeCommand(record)}`,
  )
}

const titleOf = (record: SessionRecord): string =>
  record.title || `New session in ${record.cwd.split(/[\\/]/).pop() || record.cwd}`

async function startBoard($: EngineInterface): Promise<void> {
  const saved = (await $.store.get('prefs')) as Partial<Prefs> | undefined
  if (saved) {
    await update($, prefs, () => ({
      env: typeof saved.env === 'string' ? saved.env : ALL,
      showEmpty: saved.showEmpty === true,
    }))
  }
  // A hot reload keeps the pane up but drops the timer: start it again.
  if ((await $.ui.panes()).some(pane => pane.id === PANE)) await startPolling($)
  await $.command.register({
    name: 'standup',
    description: 'Open the standup board of every Claude Code session on this machine',
  })
}

