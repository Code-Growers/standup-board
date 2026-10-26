import type { Override, SessionRecord } from '../types'
import { NOW, OVERRIDES, SESSIONS } from './harness'

const MIN = 60_000

const session = (
  id: string,
  title: string,
  repo: string,
  status: SessionRecord['status'],
  reason: string | undefined,
  idleMinutes: number,
  extra: Partial<SessionRecord> = {},
): SessionRecord => ({
  version: 1,
  id,
  title,
  groupKey: `/Users/tester/code/${repo}`,
  cwd: `/Users/tester/code/${repo}`,
  status,
  ...(reason ? { reason } : {}),
  startedAt: NOW - (idleMinutes + 30) * MIN,
  lastActivityAt: NOW - idleMinutes * MIN,
  heartbeatAt: status === 'ended' ? NOW - idleMinutes * MIN : NOW - 30_000,
  ...(status === 'ended' ? { endedAt: NOW - idleMinutes * MIN } : {}),
  ...extra,
})

export const FIXTURE_SESSIONS: SessionRecord[] = [
  session('a1', 'Fix OAuth token refresh', 'api', 'running', undefined, 1),
  session('a2', 'Add rate limiting to /v2/search', 'api', 'waiting', 'permission', 4, {
    hostSessionId: 'local_a2-desk',
    plugin: '0.2.0',
  }),
  session('a3', 'Write migration for the invoices table', 'api', 'waiting', 'reply', 22),
  session('w1', 'Redesign the settings page', 'web', 'running', undefined, 0),
  session('w2', 'Upgrade to React 19', 'web', 'waiting', 'reply', 120),
  session('w3', 'Fix the flaky checkout e2e test', 'web', 'ended', 'prompt_input_exit', 180),
  // Says running, but its process has not written for 20 minutes: gone quiet.
  session('w4', 'Investigate the memory leak', 'web', 'running', undefined, 20, {
    heartbeatAt: NOW - 20 * MIN,
  }),
  session('i1', 'Rotate the staging certificates', 'infra', 'ended', 'other', 300),
  // Ended three days ago: off the board.
  session('old', 'Spike: vector search', 'infra', 'ended', 'other', 3 * 24 * 60),
]

export const FIXTURE_OVERRIDES: Record<string, Override> = {
  w2: { review: true, at: NOW - 60 * MIN },
}

export const fixtureFiles = (): Record<string, string> => ({
  ...Object.fromEntries(
    FIXTURE_SESSIONS.map(record => [`${SESSIONS}/${record.id}.json`, JSON.stringify(record)]),
  ),
  ...Object.fromEntries(
    Object.entries(FIXTURE_OVERRIDES).map(([id, value]) => [
      `${OVERRIDES}/${id}.json`,
      JSON.stringify(value),
    ]),
  ),
  // A file caught mid-write, and one that is not ours: both ignored.
  [`${SESSIONS}/partial.json`]: '{"version":1,"id":"partial","tit',
  [`${SESSIONS}/notes.txt`]: 'not a session',
})
