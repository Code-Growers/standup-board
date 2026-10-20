# Privacy

standup-board collects no data and sends nothing off your machine.

- It makes no network requests and no model calls.
- It keeps its records in `~/.claude/standup/` on your computer: one small
  JSON file per Claude Code session (title, folder, git repository root,
  status, timestamps) and the In review flags you set.
- The only program it runs is `pbcopy`, to put a session's resume command on
  your clipboard when you press a card.

Deleting `~/.claude/standup/` removes everything it stored. Questions:
[open an issue](https://github.com/Code-Growers/standup-board/issues).
