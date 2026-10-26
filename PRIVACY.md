# Privacy

standup-board collects no data and sends nothing off your machine.

- It makes no network requests and no model calls.
- It keeps its records in `~/.claude/standup/` on your computer: one small
  JSON file per Claude Code session (title, folder, git repository root,
  status, timestamps), the In review flags you set, and which session you
  last opened from the board.
- It runs a program only when you press something on a card: `open` (or
  `xdg-open`, `start`) to show that session in the Claude desktop app, and
  `pbcopy` to put a session's resume command on your clipboard.

Deleting `~/.claude/standup/` removes everything it stored. Questions:
[open an issue](https://github.com/Code-Growers/standup-board/issues).
