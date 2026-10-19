# standup-board

A Jira-style board of every Claude Code session on your machine, in a pane
of the Claude desktop app's Code tab (it also works in the terminal). Use it
when the session sidebar gets hard to scan: one look shows what is running,
what is waiting on you, and what you are reviewing.

## Preview

A wide pane in the desktop app sets the four columns side by side:

![The standup board in a wide desktop pane](docs/screenshot.svg)

A narrow pane (or the terminal) stacks them:

<details>
<summary>Narrow pane, 40 columns</summary>

```text
5 active · 2 waiting for you

All 2   api 2   web
───

Show 1 environment with no active sessions

Running (2)
╭──────────────────────────────────────╮
│ Redesign the settings page           │
│ web · running                        │
│ just now                             │
│ → Move to review                     │
╰──────────────────────────────────────╯

╭──────────────────────────────────────╮
│ Fix OAuth token refresh              │
│ api · running                        │
│ 1m ago                               │
│ → Move to review                     │
╰──────────────────────────────────────╯

Waiting for you (2)
╭──────────────────────────────────────╮
│ Add rate limiting to /v2/search      │
│ api · needs permission               │
│ 4m ago                               │
│ → Move to review                     │
╰──────────────────────────────────────╯

╭──────────────────────────────────────╮
│ Write migration for the invoices ta… │
│ api · needs your reply               │
│ 22m ago                              │
│ → Move to review                     │
╰──────────────────────────────────────╯

In review (1)
╭──────────────────────────────────────╮
│ Upgrade to React 19                  │
│ web · needs your reply               │
│ 2h ago                               │
│ ↩ Out of review                      │
╰──────────────────────────────────────╯

Done (3)
╭──────────────────────────────────────╮
│ Investigate the memory leak          │
│ web · gone quiet                     │
│ 20m ago                              │
│ → Move to review                     │
╰──────────────────────────────────────╯

╭──────────────────────────────────────╮
│ Fix the flaky checkout e2e test      │
│ web · ended                          │
│ 3h ago                               │
│ → Move to review                     │
╰──────────────────────────────────────╯

╭──────────────────────────────────────╮
│ Rotate the staging certificates      │
│ infra · ended                        │
│ 5h ago                               │
│ → Move to review                     │
╰──────────────────────────────────────╯
```

</details>

Both previews show the sessions in `tests/fixtures.ts`, not real ones.

**It only sees sessions on the machine it runs on.** Each session reports
itself through a small file in `~/.claude/standup/`. Cloud sessions and
sessions on other computers never write there, so they don't show up.

## What it shows

| Column | How a card gets there |
| --- | --- |
| **Running** | Automatic: a turn is in progress. |
| **Waiting for you** | Automatic: the turn finished and needs your reply, or the session is on a permission prompt, a question, or an input form. A new session waits here until its first prompt. |
| **In review** | Manual: press **→ Move to review** on a card. **↩ Out of review** sends it back to its automatic column. |
| **Done** | Automatic: the session ended, or it has written nothing for 5 minutes (a crash or a force-quit). Done cards drop off the board after 24 hours. |

Each card shows the session title, its environment, its status (for example
"needs permission" or "needs your reply") and the time since its last activity.

**Environments.** Mods can't read the desktop app's environment names, so
sessions are grouped by **git repository**. A worktree session groups with its
main checkout. A folder that isn't a git repository groups by itself. Each
group is labelled with its folder name, plus the parent folder when two names
clash.

- The tabs at the top switch between **All** and one board per environment.
  The current one is bold and underlined, and the amber number beside a tab is
  how many sessions there are waiting for you.
- Environments with no active session are hidden. The link under the tabs
  shows them.
- The board remembers the environment you viewed last.
- In a narrow pane the tabs wrap onto more lines and the columns stack.

**Opening a session.** A mod can't open or focus another session, so pressing
a card copies `cd <folder> && claude --resume <id>` to your clipboard. Paste it
in a terminal, or find the session by its title in the desktop sidebar. On the desktop the copy goes through macOS `pbcopy`, because the
desktop app doesn't expose its clipboard to mods yet.

## Install

Requires Claude Code 2.1.288 or later (the desktop app bundles its own copy).

From a shell:

```bash
claude plugin marketplace add Code-Growers/standup-board
```

```bash
claude plugin install standup-board@standup-board
```

At the prompt of a terminal session, the same two steps are
`/plugin marketplace add Code-Growers/standup-board` and
`/plugin install standup-board@standup-board`.

In the desktop app, where `/plugin` doesn't run: click **+** next to the
prompt box, then **Plugins**, **Add marketplace** with
`Code-Growers/standup-board`, then **Add plugin**.

Install it at the **user** scope so that it loads in every session. A session
shows on the board once the mod is loaded in it, so sessions that were already
open appear after their next restart (or `/reload-plugins`).

## Use

Type `/standup` to open the board. It refreshes every 2 seconds while open.

## How it works

- Every session runs the tracker. It writes only its own record:
  `~/.claude/standup/sessions/<session-id>.json`. One file per session means
  sessions never race on a shared file.
- The record holds the session id, title, group key, folder, status, the reason
  it waits, last activity, and a heartbeat that is rewritten every minute.
- The status comes from the session's events:

  | Event | Status |
  | --- | --- |
  | turn starts | running |
  | turn ends | waiting for your reply |
  | permission prompt, question tool, input request | waiting on you |
  | session ends | ended |

  Subagent turns don't change the status.
- The **In review** flag is the only thing the board writes. It goes in
  `~/.claude/standup/overrides/<session-id>.json`, and the session never
  writes there.
- The board reads both folders and rereads only the files that changed. If it
  catches a file mid-write, it keeps the last good copy.
- Your view (last environment, show-empty toggle) is kept in the mod's own
  store.

**What it never does.** It makes no network requests and no model calls. It
writes nothing outside `~/.claude/standup/`. The only command it runs is
`pbcopy`, when you press a card. `claude plugin validate` lists every call the
mod makes.

**Organization-managed installs.** Where an organization manages Claude Code,
settings-hook events don't reach plugins you install yourself. The board still
works there, with two fallbacks:

- the title comes from the session's first prompt instead of its own title
- a permission prompt is detected from the engine's "ask" verdict instead

## Develop

```bash
claude plugin validate --strict .
```

```bash
claude plugin test .
```

The tests run against fixture sessions (`tests/fixtures.ts`). They cover:

- the column and grouping rules
- the tracker's status changes
- the pane on the desktop and terminal surfaces, at a wide width and at a
  narrow 40-column width

To try local changes, start a session with
`claude --plugin-dir /path/to/standup-board`. Edits reload when you save.

To type-check, copy this build's declarations into
`.claude-plugin/types/` (the engine writes them there when it loads the mod
from a `--plugin-dir` folder), then run `tsc -p .`.
