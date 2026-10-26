// The board's pictures, as SVG text for the surfaces that draw `Svg`: a buddy
// per session mood, a progress bar, and the ring gauges in the header. The
// buddy is this plugin's own character, not Anthropic's logo or mascot.

import type { Card, ColumnId } from './board'
import { isEnded } from './board'

export const PALETTE: Record<ColumnId | 'error' | 'accent', string> = {
  running: '#34d399',
  waiting: '#fbbf24',
  review: '#a78bfa',
  done: '#94a3b8',
  error: '#f87171',
  accent: '#ff8a5c',
}

export type Mood =
  | 'working'
  | 'new'
  | 'reply'
  | 'question'
  | 'permission'
  | 'input'
  | 'interrupted'
  | 'error'
  | 'review'
  | 'sleeping'

export const moodOf = (card: Card, now: number): Mood => {
  if (card.column === 'review') return 'review'
  if (card.column === 'done' || isEnded(card.record, now)) return 'sleeping'
  if (card.record.status === 'running') return 'working'
  const reason = card.record.reason ?? 'reply'

  return (
    ['new', 'question', 'permission', 'input', 'interrupted', 'error'] as const
  ).find(mood => mood === reason) ?? 'reply'
}

/** Moods that move: the frame that animates them costs more than a picture. */
export const isLively = (mood: Mood): boolean => mood !== 'review' && mood !== 'sleeping'

export const moodColor = (mood: Mood): string =>
  mood === 'working'
    ? PALETTE.running
    : mood === 'review'
      ? PALETTE.review
      : mood === 'sleeping'
        ? PALETTE.done
        : mood === 'error'
          ? PALETTE.error
          : PALETTE.waiting

/** A one-character stand-in for the buddy where a surface draws no `Svg`. */
export const GLYPH: Record<Mood, string> = {
  working: '✻',
  new: '✦',
  reply: '!',
  question: '?',
  permission: '⚿',
  input: '✎',
  interrupted: '…',
  error: '✕',
  review: '◎',
  sleeping: 'z',
}

const INK = '#2b1a12'

const spin = (values: string, seconds: number, extra = '') =>
  `<animateTransform attributeName="transform" type="${extra || 'translate'}" values="${values}" dur="${seconds}s" repeatCount="indefinite"/>`

const pulse = (attribute: string, values: string, seconds: number) =>
  `<animate attributeName="${attribute}" values="${values}" dur="${seconds}s" repeatCount="indefinite"/>`

const bubble = (mood: Mood, color: string, animate: boolean, id: string): string => {
  const sign: Partial<Record<Mood, string>> = {
    new: '✦',
    reply: '!',
    question: '?',
    input: '✎',
    interrupted: '…',
    error: '!',
  }
  const inside =
    mood === 'permission'
      ? `<rect x="46.5" y="12" width="9" height="7" rx="1.5" fill="${INK}"/><path d="M48.5 12v-2.2a2.5 2.5 0 0 1 5 0V12" stroke="${INK}" stroke-width="1.8" fill="none"/>`
      : `<text x="51" y="17.6" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="800" fill="${INK}">${sign[mood] ?? '!'}</text>`

  return `<g filter="url(#glow-${id})">${animate ? spin('0 0;0 -1.5;0 0', 1.4) : ''}<circle cx="51" cy="13" r="10" fill="${color}"/><path d="M44 19l-3 5 6-2z" fill="${color}"/>${inside}</g>`
}

/** The buddy for one mood, 64 by 64. */
export const buddy = (mood: Mood, animate = true): string => {
  const color = moodColor(mood)
  const move = animate && isLively(mood)
  const isAsleep = mood === 'sleeping'
  // Ids stay unique when a surface inlines several pictures into one page.
  const id = `${mood}${move ? '-a' : ''}`

  const eyes =
    mood === 'working'
      ? `<rect x="24.5" y="33" width="4" height="4" rx="1.5" fill="${INK}"/><rect x="35.5" y="33" width="4" height="4" rx="1.5" fill="${INK}"/>`
      : isAsleep
        ? `<path d="M23.5 33q2.5 2.5 5 0M35 33q2.5 2.5 5 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
        : mood === 'error'
          ? `<path d="M24 30l4 4m0-4l-4 4M36 30l4 4m0-4l-4 4" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`
          : `<g>${move ? pulse('opacity', '1;1;1;0;1', 4) : ''}<rect x="24.5" y="29.5" width="4" height="6" rx="2" fill="${INK}"/><rect x="35.5" y="29.5" width="4" height="6" rx="2" fill="${INK}"/></g>`
  const mouth =
    mood === 'working'
      ? `<path d="M30 41h4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`
      : isAsleep
        ? `<circle cx="32" cy="41" r="1.6" fill="${INK}"/>`
        : mood === 'error' || mood === 'interrupted'
          ? `<path d="M29 42q3-2.5 6 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
          : `<path d="M29 40q3 2.6 6 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`

  const arms =
    mood === 'working'
      ? `<g>${move ? spin('0 0;0 1.5;0 0', 0.35) : ''}<rect x="11" y="38" width="8" height="4" rx="2" fill="url(#body-${id})"/></g><g>${move ? spin('0 1.5;0 0;0 1.5', 0.35) : ''}<rect x="45" y="38" width="8" height="4" rx="2" fill="url(#body-${id})"/></g>`
      : mood === 'review'
        ? `<rect x="11" y="37" width="7" height="4" rx="2" fill="url(#body-${id})"/><rect x="44" y="30" width="8" height="4" rx="2" fill="url(#body-${id})" transform="rotate(-35 44 32)"/>`
        : isAsleep
          ? `<rect x="13" y="40" width="6" height="4" rx="2" fill="url(#body-${id})"/><rect x="45" y="40" width="6" height="4" rx="2" fill="url(#body-${id})"/>`
          : `<rect x="11" y="37" width="7" height="4" rx="2" fill="url(#body-${id})"/><g>${move ? spin('-18 48 31;14 48 31;-18 48 31', 1, 'rotate') : ''}<rect x="46" y="18" width="4" height="13" rx="2" fill="url(#body-${id})"/></g>`

  const extra =
    mood === 'working'
      ? `<rect x="15" y="44" width="34" height="11" rx="2.5" fill="#1e293b" stroke="${color}" stroke-width="1.2"/><rect x="18" y="47" width="28" height="2" rx="1" fill="${color}" filter="url(#glow-${id})">${move ? pulse('width', '6;28;14;24;6', 1.6) : ''}</rect><g fill="${color}" filter="url(#glow-${id})">${move ? pulse('opacity', '0;1;0', 1.2) : ''}<path d="M52 14l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z"/><path d="M12 18l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></g>`
      : mood === 'review'
        ? `<g filter="url(#glow-${id})"><circle cx="52" cy="22" r="7" fill="${color}" fill-opacity=".2" stroke="${color}" stroke-width="3"/><path d="M47 27l-4 4" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/></g>`
        : isAsleep
          ? `<g fill="${color}" font-family="system-ui,-apple-system,sans-serif" font-weight="800"><text x="46" y="20" font-size="10">z</text><text x="53" y="12" font-size="7">z</text></g>`
          : bubble(mood, color, move, id)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs><radialGradient id="aura-${id}"><stop offset="0" stop-color="${color}" stop-opacity=".55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient><linearGradient id="body-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffa477"/><stop offset="1" stop-color="#e5653a"/></linearGradient><filter id="glow-${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="32" cy="36" r="30" fill="url(#aura-${id})" opacity="${isAsleep ? 0.45 : 0.9}">${move ? pulse('opacity', '.55;1;.55', 2.2) : ''}</circle><g opacity="${isAsleep ? 0.7 : 1}">${move && mood !== 'working' ? spin('0 0;0 -1.2;0 0', 1.8) : ''}<rect x="24" y="47" width="5" height="7" rx="2" fill="#c9542e"/><rect x="35" y="47" width="5" height="7" rx="2" fill="#c9542e"/><rect x="17" y="22" width="30" height="28" rx="8" fill="url(#body-${id})" stroke="#b84a26" stroke-width="1.5"/><rect x="21" y="25" width="10" height="3" rx="1.5" fill="#fff" fill-opacity=".35"/>${eyes}${mouth}${arms}</g>${extra}</svg>`
}

/** A thin glowing bar: a moving shimmer while working, else filled to `fraction`. */
export const bar = (color: string, fraction: number | 'busy'): string => {
  const fill =
    fraction === 'busy'
      ? `<rect x="0" y="1" width="30" height="4" rx="2" fill="url(#shine-bar)" filter="url(#glow-bar)"><animate attributeName="x" values="-30;100" dur="1.6s" repeatCount="indefinite"/></rect>`
      : `<rect x="0" y="1" width="${Math.max(3, Math.min(1, fraction) * 100).toFixed(1)}" height="4" rx="2" fill="${color}" filter="url(#glow-bar)"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 6" width="100%" height="6" preserveAspectRatio="none"><defs><linearGradient id="shine-bar"><stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset=".5" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient><filter id="glow-bar" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect x="0" y="1" width="100" height="4" rx="2" fill="${color}" fill-opacity=".15"/>${fill}</svg>`
}

export type Gauge = { label: string; count: number; color: string }

/** Ring gauges for the header: each ring filled by its share of `total`. */
export const rings = (gauges: readonly Gauge[], total: number): string => {
  const size = 72
  const circumference = 2 * Math.PI * 24
  const parts = gauges.map((gauge, index) => {
    const share = total > 0 ? gauge.count / total : 0
    // The first ring starts at the left edge, lined up with the text below it.
    const x = index * size + 30

    return `<g><circle cx="${x}" cy="29" r="24" fill="none" stroke="${gauge.color}" stroke-opacity=".18" stroke-width="6"/><circle cx="${x}" cy="29" r="24" fill="none" stroke="${gauge.color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(share * circumference).toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 ${x} 29)" filter="url(#glow-rings)"/><text x="${x}" y="35" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="17" font-weight="800" fill="${gauge.color}">${gauge.count}</text><text x="${x}" y="70" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="9.5" font-weight="700" letter-spacing=".08em" fill="${gauge.color}">${gauge.label}</text></g>`
  })
  const width = (gauges.length - 1) * size + 60

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 78" width="${width}" height="78"><defs><filter id="glow-rings" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${parts.join('')}</svg>`
}
