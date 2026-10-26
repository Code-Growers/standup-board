import type { Override, SessionRecord } from '../types'

export type ColumnId = 'running' | 'waiting' | 'review' | 'done'

export const COLUMNS: readonly { id: ColumnId; title: string }[] = [
  { id: 'running', title: 'Running' },
  { id: 'waiting', title: 'Waiting for you' },
  { id: 'review', title: 'In review' },
  { id: 'done', title: 'Done' },
]

export const ALL = 'all'

/** A live session that has not written for this long is treated as ended. */
export const STALE_MS = 5 * 60_000
/** Done cards drop off the board this long after their last activity. */
export const DONE_VISIBLE_MS = 24 * 60 * 60_000

export type Card = {
  record: SessionRecord
  column: ColumnId
  isReview: boolean
  envLabel: string
}

export type Environment = {
  key: string
  label: string
  active: number
  waiting: number
}

export type Board = {
  /** Every environment with a card on the board, active ones first. */
  environments: Environment[]
  /** The environment shown: the one asked for, or `all` when it is hidden. */
  env: string
  columns: { id: ColumnId; title: string; cards: Card[] }[]
  total: { active: number; waiting: number }
  hiddenEnvironments: number
}

export const isEnded = (record: SessionRecord, now: number): boolean =>
  record.status === 'ended' || now - record.heartbeatAt > STALE_MS

export const columnOf = (
  record: SessionRecord,
  override: Override | undefined,
  now: number,
): ColumnId => {
  if (override?.review) return 'review'
  if (isEnded(record, now)) return 'done'

  return record.status === 'running' ? 'running' : 'waiting'
}

const baseName = (path: string): string =>
  path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path

const parentAndBase = (path: string): string =>
  path.replace(/[\\/]+$/, '').split(/[\\/]/).slice(-2).join('/') || path

/** A short label per group key: its folder name, with the parent where two clash. */
export const labelEnvironments = (keys: readonly string[]): Map<string, string> => {
  const unique = [...new Set(keys)]
  const counts = new Map<string, number>()
  for (const key of unique) counts.set(baseName(key), (counts.get(baseName(key)) ?? 0) + 1)

  return new Map(
    unique.map(key => [
      key,
      (counts.get(baseName(key)) ?? 0) > 1 ? parentAndBase(key) : baseName(key),
    ]),
  )
}

export const buildBoard = (input: {
  sessions: readonly SessionRecord[]
  overrides: Readonly<Record<string, Override>>
  now: number
  env: string
  showEmpty: boolean
}): Board => {
  const { sessions, overrides, now } = input
  const labels = labelEnvironments(sessions.map(s => s.groupKey))

  const cards: Card[] = sessions
    .map(record => {
      const override = overrides[record.id]
      const column = columnOf(record, override, now)

      return {
        record,
        column,
        isReview: override?.review === true,
        envLabel: labels.get(record.groupKey) ?? baseName(record.groupKey),
      }
    })
    .filter(
      card =>
        card.column !== 'done' ||
        now - (card.record.endedAt ?? card.record.lastActivityAt) < DONE_VISIBLE_MS,
    )

  const byKey = new Map<string, Environment>()
  for (const card of cards) {
    const key = card.record.groupKey
    const env = byKey.get(key) ?? { key, label: card.envLabel, active: 0, waiting: 0 }
    if (card.column !== 'done') env.active += 1
    if (card.column === 'waiting') env.waiting += 1
    byKey.set(key, env)
  }
  const every = [...byKey.values()].sort(
    (a, b) =>
      b.waiting - a.waiting || b.active - a.active || a.label.localeCompare(b.label),
  )
  const environments = input.showEmpty ? every : every.filter(env => env.active > 0)
  const env = environments.some(e => e.key === input.env) ? input.env : ALL

  const shown = env === ALL ? cards : cards.filter(card => card.record.groupKey === env)
  const columns = COLUMNS.map(column => ({
    ...column,
    cards: shown
      .filter(card => card.column === column.id)
      .sort((a, b) => b.record.lastActivityAt - a.record.lastActivityAt),
  }))

  return {
    environments,
    env,
    columns,
    total: {
      active: cards.filter(card => card.column !== 'done').length,
      waiting: cards.filter(card => card.column === 'waiting').length,
    },
    hiddenEnvironments: every.length - environments.length,
  }
}

export const ago = (then: number, now: number): string => {
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`

  return `${Math.floor(hours / 24)}d ago`
}

const REASONS: Record<string, string> = {
  new: 'new session',
  reply: 'needs your reply',
  interrupted: 'interrupted',
  error: 'stopped on an error',
  permission: 'needs permission',
  question: 'asked you a question',
  input: 'needs input',
}

export const statusText = (card: Card, now: number): string => {
  const { record } = card
  if (isEnded(record, now)) return record.status === 'ended' ? 'ended' : 'gone quiet'
  if (record.status === 'running') return 'running'

  return REASONS[record.reason ?? 'reply'] ?? 'waiting'
}

export const clip = (text: string, width: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (width <= 1) return flat.slice(0, Math.max(0, width))

  return flat.length > width ? `${flat.slice(0, width - 1)}…` : flat
}

const shellQuote = (value: string): string =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`

export const resumeCommand = (record: SessionRecord): string =>
  `cd ${shellQuote(record.cwd)} && claude --resume ${record.id}`

export const parseRecord = (text: string): SessionRecord | undefined => {
  try {
    const value = JSON.parse(text) as Partial<SessionRecord>
    const isRecord =
      value?.version === 1 &&
      typeof value.id === 'string' &&
      typeof value.groupKey === 'string' &&
      typeof value.heartbeatAt === 'number' &&
      typeof value.lastActivityAt === 'number' &&
      (value.status === 'running' || value.status === 'waiting' || value.status === 'ended')

    return isRecord ? (value as SessionRecord) : undefined
  } catch {
    return undefined
  }
}

export const parseOverride = (text: string): Override | undefined => {
  try {
    const value = JSON.parse(text) as Partial<Override>

    return typeof value?.review === 'boolean' && typeof value.at === 'number'
      ? { review: value.review, at: value.at }
      : undefined
  } catch {
    return undefined
  }
}
