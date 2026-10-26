import { describe, expect, test } from 'claude-code/testing'

import {
  ALL,
  ago,
  buildBoard,
  clip,
  columnOf,
  labelEnvironments,
  parseRecord,
  resumeCommand,
} from '../hooks/board'
import { rings } from '../hooks/art'
import { FIXTURE_OVERRIDES, FIXTURE_SESSIONS } from './fixtures'
import { NOW } from './harness'

const API = '/Users/tester/code/api'
const INFRA = '/Users/tester/code/infra'

const board = (env = ALL, showEmpty = false) =>
  buildBoard({ sessions: FIXTURE_SESSIONS, overrides: FIXTURE_OVERRIDES, now: NOW, env, showEmpty })

const ids = (result: ReturnType<typeof board>, column: string) =>
  result.columns.find(entry => entry.id === column)?.cards.map(card => card.record.id)

describe('columns', () => {
  test('sessions land in their columns, newest activity first', () => {
    const result = board()
    expect(ids(result, 'running')).toEqual(['w1', 'a1'])
    expect(ids(result, 'waiting')).toEqual(['a2', 'a3'])
    expect(ids(result, 'review')).toEqual(['w2'])
    expect(ids(result, 'done')).toEqual(['w4', 'w3', 'i1'])
  })

  test('a session silent past the stale limit is done, whatever it last said', () => {
    const quiet = FIXTURE_SESSIONS.find(record => record.id === 'w4')!
    expect(columnOf(quiet, undefined, NOW)).toBe('done')
    expect(columnOf({ ...quiet, heartbeatAt: NOW }, undefined, NOW)).toBe('running')
  })

  test('the review override wins over every automatic column', () => {
    const ended = FIXTURE_SESSIONS.find(record => record.id === 'w3')!
    expect(columnOf(ended, { review: true, at: NOW }, NOW)).toBe('review')
    expect(columnOf(ended, { review: false, at: NOW }, NOW)).toBe('done')
  })

  test('done sessions older than a day drop off the board', () => {
    expect(board().columns.flatMap(entry => entry.cards).some(card => card.record.id === 'old')).toBe(false)
  })
})

describe('environments', () => {
  test('counts active and waiting sessions per environment, hiding the idle ones', () => {
    const result = board()
    expect(result.environments.map(env => [env.label, env.active, env.waiting])).toEqual([
      ['api', 3, 2],
      ['web', 2, 0],
    ])
    expect(result.hiddenEnvironments).toBe(1)
    expect(result.total).toEqual({ active: 5, waiting: 2 })
  })

  test('the toggle shows environments with no active sessions', () => {
    const result = board(ALL, true)
    expect(result.environments.map(env => env.label)).toEqual(['api', 'web', 'infra'])
    expect(result.hiddenEnvironments).toBe(0)
  })

  test('one environment filters the board', () => {
    const result = board(API)
    expect(result.env).toBe(API)
    expect(result.columns.flatMap(entry => entry.cards).every(card => card.record.groupKey === API)).toBe(true)
  })

  test('a remembered environment that is hidden falls back to All', () => {
    expect(board(INFRA).env).toBe(ALL)
    expect(board(INFRA, true).env).toBe(INFRA)
  })

  test('labels are folder names, with the parent where two clash', () => {
    const labels = labelEnvironments(['/a/code/api', '/a/clients/api', '/a/code/web/'])
    expect([...labels.values()]).toEqual(['code/api', 'clients/api', 'web'])
  })
})

describe('text', () => {
  test('time since last activity', () => {
    expect(ago(NOW - 10_000, NOW)).toBe('just now')
    expect(ago(NOW - 5 * 60_000, NOW)).toBe('5m ago')
    expect(ago(NOW - 3 * 3_600_000, NOW)).toBe('3h ago')
    expect(ago(NOW - 72 * 3_600_000, NOW)).toBe('3d ago')
  })

  test('clip cuts with an ellipsis and flattens whitespace', () => {
    expect(clip('Fix  the\nlogin bug', 40)).toBe('Fix the login bug')
    expect(clip('Fix the login bug', 8)).toBe('Fix the…')
  })

  test('the resume command quotes a folder with spaces', () => {
    const record = { ...FIXTURE_SESSIONS[0]!, cwd: "/Users/tester/My Code/it's" }
    expect(resumeCommand(record)).toBe(`cd '/Users/tester/My Code/it'\\''s' && claude --resume a1`)
  })

  test('a partial or foreign file parses as nothing', () => {
    expect(parseRecord('{"version":1,"id":"x"')).toBe(undefined)
    expect(parseRecord('{"id":"x"}')).toBe(undefined)
    expect(parseRecord(JSON.stringify(FIXTURE_SESSIONS[0]))?.id).toBe('a1')
  })
})

describe('art', () => {
  test('the first ring gauge starts at the left edge, lined up with the text below it', () => {
    const svg = rings(
      [
        { label: 'RUNNING', count: 1, color: '#000' },
        { label: 'DONE', count: 2, color: '#000' },
      ],
      3,
    )
    expect(svg).toContain('cx="30"')
    expect(svg).toContain('width="132"')
  })
})
