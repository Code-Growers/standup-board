import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PALETTE } from '../hooks/art'
import { fixtureFiles } from './fixtures'
import { SESSIONS, NOW, paneProps, world } from './harness'
import type { WorldOptions } from './harness'

const SURFACES = ['desktop', 'terminal'] as const
const STANDUP = {
  command: 'standup',
  args: '',
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 160 },
}
const WIDE = 120
const NARROW = 40

const openBoard = async ($: Engine, on: On, options: WorldOptions = {}) => {
  const w = world(on, { files: fixtureFiles(), ...options })
  await $.command.run(STANDUP)

  return w
}

const mount = ($: Engine, surface: 'desktop' | 'terminal' | 'mobile', columns: number) =>
  $.ui.mount({
    plugin: 'standup-board',
    surface,
    component: 'Pane',
    requestId: 'standup',
    props: paneProps(columns),
    viewport: { columns: columns + 60, rows: 50, isFullscreen: true },
  })

const headers = async (ui: Awaited<ReturnType<typeof mount>>) =>
  (await ui.findAll({ type: 'Text', text: /^● (Running|Waiting for you|In review|Done) \(\d+\)$/ })).map(
    found => found.text.replace(/^● /, ''),
  )

describe('board pane', () => {
  for (const surface of SURFACES) {
    test(`${surface}: four columns side by side in a wide pane`, async ($, on) => {
      await openBoard($, on)
      const ui = await mount($, surface, WIDE)
      expect(await headers(ui)).toEqual([
        'Running (2)',
        'Waiting for you (2)',
        'In review (1)',
        'Done (3)',
      ])
      const running = await ui.find({ type: 'Box', key: 'col:running' })
      expect(running?.props.width).toBe(Math.floor((WIDE - 3) / 4))
      const card = (await ui.find({ key: 'open:a2' }))?.text ?? ''
      expect(card).toContain('Add rate limiting')
      expect(card).toContain('needs permission')
      expect(card).toContain('4m ago')
      expect((await ui.find({ key: 'open:w4' }))?.text).toContain('gone quiet')
      expect((await ui.find({ key: 'copy:a2' }))?.props.label).toBe('⧉ Copy')
      if (surface === 'terminal') {
        expect(await ui.find({ type: 'Text', text: /5 active/ })).toBeDefined()
      } else {
        const alts = (await ui.findAll({ type: 'Svg' })).map(found => found.props.alt)
        expect(alts).toContain('5 active, 2 waiting for you')
      }
      await ui.unmount()
    })

    test(`${surface}: a narrow pane stacks the columns, with room between cards`, async ($, on) => {
      await openBoard($, on)
      const ui = await mount($, surface, NARROW)
      const running = await ui.find({ type: 'Box', key: 'col:running' })
      expect(running?.props.width).toBe(NARROW)
      expect(running?.props.rowGap).toBe(1)
      await ui.press({ key: 'env:2' })
      expect(await headers(ui)).toEqual([
        'Running (1)',
        'Waiting for you (0)',
        'In review (1)',
        'Done (2)',
      ])
      await ui.unmount()
    })

    test(`${surface}: project tabs are one kind of button, the current one highlighted`, async ($, on) => {
      const w = await openBoard($, on)
      const ui = await mount($, surface, WIDE)
      const tabs = (await ui.findAll({ type: 'Button' })).filter(found => found.key?.startsWith('env:'))
      expect(tabs.map(found => found.text)).toEqual(['All 2', 'api 2', 'web'])
      expect((await ui.find({ type: 'Text', text: 'All' }))?.props).toMatchObject({
        bold: true,
        underline: true,
        color: PALETTE.accent,
      })
      expect((await ui.find({ type: 'Text', text: 'web' }))?.props.dimColor).toBe(true)
      const counts = await ui.findAll({ type: 'Text', text: /^ \d+$/ })
      expect(counts.map(found => [found.text.trim(), found.props.color])).toEqual([
        ['2', PALETTE.waiting],
        ['2', PALETTE.waiting],
      ])

      await ui.press({ key: 'env:1' })
      expect((await ui.find({ type: 'Text', text: 'api' }))?.props.bold).toBe(true)
      expect(await headers(ui)).toEqual([
        'Running (1)',
        'Waiting for you (2)',
        'In review (0)',
        'Done (0)',
      ])
      expect(w.store.get('prefs')).toEqual({ env: '/Users/tester/code/api', showEmpty: false })
      await ui.unmount()
    })

    test(`${surface}: the toggle shows environments with no active sessions`, async ($, on) => {
      await openBoard($, on)
      const ui = await mount($, surface, WIDE)
      expect((await ui.find({ key: 'toggle-empty' }))?.text).toContain('Show 1 idle project')
      await ui.press({ key: 'toggle-empty' })
      expect((await ui.find({ key: 'env:3' }))?.text).toBe('infra')
      expect((await ui.find({ key: 'toggle-empty' }))?.text).toContain('Hide')
      await ui.unmount()
    })

    test(`${surface}: the review button moves a card in and out of review`, async ($, on) => {
      const w = await openBoard($, on)
      const ui = await mount($, surface, WIDE)
      await ui.press({ key: 'review:a1' })
      expect(w.override('a1')).toEqual({ review: true, at: NOW })
      expect(await headers(ui)).toEqual([
        'Running (1)',
        'Waiting for you (2)',
        'In review (2)',
        'Done (3)',
      ])
      expect((await ui.find({ key: 'review:a1' }))?.text).toContain('Out of review')
      await ui.press({ key: 'review:a1' })
      expect(w.override('a1')?.review).toBe(false)
      expect((await headers(ui))[0]).toBe('Running (2)')
      await ui.unmount()
    })

    test(`${surface}: a card press copies its resume command`, async ($, on) => {
      const w = await openBoard($, on, { isClipboard: surface === 'terminal' })
      const ui = await mount($, surface, WIDE)
      await ui.press({ key: 'copy:a2' })
      expect(w.copies).toEqual(['cd /Users/tester/code/api && claude --resume a2'])
      // A remote surface has no clipboard path yet: pbcopy stands in.
      expect(w.runs).toEqual(surface === 'desktop' ? [['pbcopy']] : [])
      expect(w.toasts.at(-1)).toContain('copied')
      expect(await ui.find({ type: 'Code' })).toBe(undefined)
      await ui.unmount()
    })
  }

  test('desktop: every project shows, with no "+N more", the idle toggle at the row end', async ($, on) => {
    const files = fixtureFiles()
    for (let i = 0; i < 12; i += 1) {
      const folder = `/Users/tester/code/project-${String(i).padStart(2, '0')}`
      files[`${SESSIONS}/p${i}.json`] = JSON.stringify({
        version: 1,
        id: `p${i}`,
        title: `Project ${i} work`,
        groupKey: folder,
        cwd: folder,
        status: 'running',
        startedAt: NOW,
        lastActivityAt: NOW,
        heartbeatAt: NOW,
      })
    }
    await openBoard($, on, { files })
    const ui = await mount($, 'desktop', WIDE)
    const buttons = await ui.findAll({ type: 'Button' })
    expect(buttons.filter(found => found.key?.startsWith('env:')).length).toBe(15)
    expect(await ui.find({ key: 'more-projects' })).toBe(undefined)
    const keys = buttons.map(found => found.key)
    expect(keys.indexOf('toggle-empty')).toBe(keys.indexOf('env:14') + 1)
    await ui.unmount()
  })

  test('desktop: pressing a card opens its session in Claude', async ($, on) => {
    const w = await openBoard($, on)
    const ui = await mount($, 'desktop', WIDE)
    await ui.press({ key: 'open:a2' })
    expect(w.runs).toEqual([['open', 'claude://code/continue?session=local_a2-desk']])
    expect(w.toasts.at(-1)).toBe('Opening the session in Claude')
    expect((await ui.find({ key: 'go:a2' }))?.props.label).toBe('↗ Open')

    // A session started in a terminal has no desktop id: its resume command is copied.
    await ui.press({ key: 'open:a1' })
    expect(w.copies).toEqual(['cd /Users/tester/code/api && claude --resume a1'])
    expect(await ui.find({ key: 'go:a1' })).toBe(undefined)
    await ui.unmount()
  })

  test('desktop: an engine before 2.1.299 gets plain labels', async ($, on) => {
    await openBoard($, on, { version: '2.1.288' })
    const ui = await mount($, 'desktop', WIDE)
    expect((await ui.find({ key: 'env:0' }))?.props.label).toBe('▸ All 2')
    expect((await ui.find({ key: 'env:1' }))?.props.label).toBe('api 2')
    expect(await ui.find({ key: 'open:a2' })).toBe(undefined)
    expect((await ui.find({ key: 'go:a2' }))?.props.label).toBe('↗ Open')
    await ui.unmount()
  })

  test('desktop: the review action sits on its own row with space above it', async ($, on) => {
    await openBoard($, on)
    const ui = await mount($, 'desktop', WIDE)
    expect((await ui.find({ type: 'Box', key: 'actions:a1' }))?.props.marginTop).toBe(1)
    await ui.unmount()
  })

  test('desktop: each card shows its buddy, glowing in its column colour', async ($, on) => {
    await openBoard($, on)
    const ui = await mount($, 'desktop', WIDE)
    const pictures = await ui.findAll({ type: 'Svg' })
    const alts = pictures.map(found => String(found.props.alt))
    expect(alts).toContain('running')
    expect(alts).toContain('needs permission')
    expect(alts).toContain('gone quiet')
    expect(alts.some(alt => /active, \d+ waiting for you/.test(alt))).toBe(true)
    const working = pictures.find(found => found.props.alt === 'running')
    expect(working?.props.isInteractive).toBe(true)
    expect(String(working?.props.source)).toContain('animateTransform')
    const asleep = pictures.find(found => found.props.alt === 'gone quiet')
    expect(asleep?.props.isInteractive).toBe(undefined)
    expect((await ui.find({ type: 'Box', key: 'box:a2' }))?.props.borderColor).toBe(PALETTE.waiting)
    await ui.unmount()
  })

  test('terminal: glyphs stand in for the pictures', async ($, on) => {
    await openBoard($, on)
    const ui = await mount($, 'terminal', WIDE)
    expect(await ui.find({ type: 'Svg' })).toBe(undefined)
    expect(await ui.find({ type: 'Text', text: '⚿' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✻' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5 active/ })).toBeDefined()
    await ui.unmount()
  })

  test('mobile: the board draws with pictures and no input elements', async ($, on) => {
    await openBoard($, on)
    const ui = await mount($, 'mobile', NARROW)
    expect((await ui.findAll({ type: 'Svg' })).length).toBeGreaterThan(0)
    expect((await headers(ui))[0]).toBe('Running (2)')
    await ui.unmount()
  })

  test('desktop: the board picks up a new session on the next poll', async ($, on) => {
    const w = await openBoard($, on)
    const ui = await mount($, 'desktop', WIDE)
    const fresh = {
      version: 1,
      id: 'n1',
      title: 'Brand new work',
      groupKey: '/Users/tester/code/api',
      cwd: '/Users/tester/code/api',
      status: 'running',
      startedAt: NOW,
      lastActivityAt: NOW,
      heartbeatAt: NOW,
    }
    w.files.set(`${SESSIONS}/n1.json`, JSON.stringify(fresh))
    await w.clock.advance(2_000)
    expect(await ui.find({ type: 'Text', text: 'Brand new work' })).toBeDefined()
    expect((await headers(ui))[0]).toBe('Running (3)')
    await ui.unmount()
  })

  test('the remembered environment comes back in a new session', async ($, on) => {
    const w = world(on, { files: fixtureFiles(), isPaneOpen: true })
    w.store.set('prefs', { env: '/Users/tester/code/web', showEmpty: false })
    await $.session.start({ cwd: '/Users/tester/code/api', surface: 'desktop', isInteractive: true })
    const ui = await mount($, 'desktop', WIDE)
    expect((await ui.find({ type: 'Text', text: 'web' }))?.props.bold).toBe(true)
    expect((await headers(ui))[0]).toBe('Running (1)')
    await ui.unmount()
  })

  test('desktop: an empty board says why', async ($, on) => {
    await openBoard($, on, { files: {} })
    const ui = await mount($, 'desktop', NARROW)
    expect(await ui.find({ type: 'Text', text: 'No sessions yet' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /only sees sessions on this machine/ })).toBeDefined()
    await ui.unmount()
  })

  test('/standup opens the pane', async ($, on) => {
    const w = world(on, { files: {} })
    const result = await $.command.run(STANDUP)
    expect(w.opened).toEqual(['standup'])
    expect(result.text).toBe('Standup board opened.')
  })
})
