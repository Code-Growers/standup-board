import { describe, expect, test } from 'claude-code/testing'

import { NOW, world } from './harness'

const START = { cwd: '/Users/tester/code/api', surface: 'desktop' as const, isInteractive: true }
const done = (turnId: string, reason: 'answer' | 'aborted' | 'error' = 'answer', agentId?: string) => ({
  turnId,
  reason,
  answer: 'Done.',
  durationMs: 1_000,
  isAborted: reason === 'aborted',
  ...(agentId ? { agentId } : {}),
})

describe('tracker', () => {
  test('a new session writes its own record, waiting as new', async ($, on) => {
    const w = world(on, { sessionId: 'sess-1', hostSessionId: 'local_abc' })
    await $.session.start(START)
    expect(w.record('sess-1')).toMatchObject({
      version: 1,
      id: 'sess-1',
      groupKey: '/Users/tester/code/api',
      cwd: '/Users/tester/code/api',
      hostSessionId: 'local_abc',
      status: 'waiting',
      reason: 'new',
      heartbeatAt: NOW,
    })
  })

  test('loaded into a running session, it takes the title and status from the transcript', async ($, on) => {
    const w = world(on, {
      sessionId: 'sess-mid',
      history: [
        { role: 'user', text: '<command-name>/reload-plugins</command-name>' },
        { role: 'user', text: 'Build the standup board' },
        { role: 'assistant', text: 'Done.' },
      ],
    })
    await $.session.start(START)
    expect(w.record('sess-mid')).toMatchObject({
      title: 'Build the standup board',
      status: 'waiting',
      reason: 'reply',
    })
  })

  test('groups a worktree session under its repository root', async ($, on) => {
    const w = world(on, {
      sessionId: 'sess-wt',
      cwd: '/Users/tester/code/api/.claude/worktrees/fix-login',
      repo: { root: '/Users/tester/code/api', remote: null, internal: false, name: null },
    })
    await $.session.start(START)
    expect(w.record('sess-wt')?.groupKey).toBe('/Users/tester/code/api')
  })

  test('falls back to the project root outside a git repository', async ($, on) => {
    const w = world(on, { sessionId: 'sess-nogit', cwd: '/Users/tester/notes', repo: null })
    await $.session.start(START)
    expect(w.record('sess-nogit')?.groupKey).toBe('/Users/tester/notes')
  })

  test('a turn runs, then waits for your reply, titled by the first prompt', async ($, on) => {
    const w = world(on, { sessionId: 'sess-2' })
    await $.session.start(START)
    await w.clock.advance(5_000)
    await $.turn.start({ text: 'Fix the login bug on Safari', turnId: 't1' })
    expect(w.record('sess-2')).toMatchObject({ status: 'running', title: 'Fix the login bug on Safari' })
    expect(w.record('sess-2')?.reason).toBe(undefined)

    await $.turn.complete(done('t1'))
    expect(w.record('sess-2')).toMatchObject({ status: 'waiting', reason: 'reply' })

    await $.turn.start({ text: 'Now add a test', turnId: 't2' })
    expect(w.record('sess-2')?.title).toBe('Fix the login bug on Safari')
  })

  test('the session title wins over the first prompt', async ($, on) => {
    const w = world(on, { sessionId: 'sess-3' })
    await $.session.start(START)
    await $.turn.start({ text: 'fix it', turnId: 't1' })
    await $.classic.UserPromptSubmit({ prompt: 'and more', session_title: 'Safari login fix' })
    await $.turn.complete(done('t1'))
    expect(w.record('sess-3')?.title).toBe('Safari login fix')
  })

  test('a subagent turn leaves the session status alone', async ($, on) => {
    const w = world(on, { sessionId: 'sess-4' })
    await $.session.start(START)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.turn.start({ text: 'look around', turnId: 't2', agentId: 'agent-1' })
    await $.turn.complete(done('t2', 'answer', 'agent-1'))
    expect(w.record('sess-4')?.status).toBe('running')
  })

  test('an interrupted turn waits as interrupted', async ($, on) => {
    const w = world(on, { sessionId: 'sess-5' })
    await $.session.start(START)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.turn.complete(done('t1', 'aborted'))
    expect(w.record('sess-5')).toMatchObject({ status: 'waiting', reason: 'interrupted' })
  })

  test('a permission prompt waits on you until it is answered', async ($, on) => {
    const w = world(on, { sessionId: 'sess-6' })
    await $.session.start(START)
    await $.turn.start({ text: 'deploy', turnId: 't1' })
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'make deploy' } })
    expect(w.record('sess-6')).toMatchObject({ status: 'waiting', reason: 'permission' })

    await $.classic.PermissionDenied({ tool_name: 'Bash', tool_input: {}, tool_use_id: 'u1', reason: 'no' } as never)
    expect(w.record('sess-6')?.status).toBe('running')
  })

  test('the session ending marks the record ended', async ($, on) => {
    const w = world(on, { sessionId: 'sess-8' })
    await $.session.start(START)
    await w.clock.advance(60_000)
    await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-8', resume: { id: 'sess-8' } })
    expect(w.record('sess-8')).toMatchObject({
      status: 'ended',
      reason: 'prompt_input_exit',
      endedAt: NOW + 60_000,
    })
  })

  test('the heartbeat rewrites the record every minute', async ($, on) => {
    const w = world(on, { sessionId: 'sess-9' })
    await $.session.start(START)
    await w.clock.advance(61_000)
    expect(w.record('sess-9')?.heartbeatAt).toBe(NOW + 60_000)
  })

  test('tool calls stamp activity without a write each time', async ($, on) => {
    const w = world(on, { sessionId: 'sess-11' })
    await $.session.start(START)
    await $.turn.start({ text: 'go', turnId: 't1' })
    const before = w.writeCount()
    for (let i = 0; i < 5; i += 1) await $.tool.call({ tool: 'Read', input: { file_path: '/x' } } as never)
    expect(w.writeCount()).toBe(before)
    await w.clock.advance(16_000)
    await $.tool.call({ tool: 'Read', input: { file_path: '/x' } } as never)
    expect(w.record('sess-11')?.lastActivityAt).toBe(NOW + 16_000)
  })

  test('writes nothing outside its own folder', async ($, on) => {
    const w = world(on, { sessionId: 'sess-10' })
    await $.session.start(START)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.turn.complete(done('t1'))
    await $.session.end({ reason: 'other', sessionId: 'sess-10', resume: { id: 'sess-10' } })
    for (const path of w.files.keys()) expect(path.startsWith('/Users/tester/.claude/standup/')).toBe(true)
  })
})
