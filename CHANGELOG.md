# Changelog

## Unreleased (branch `codex`)

- Experimental support for **Codex (OpenAI)**: its limits are read from its session files
  (`~/.codex/sessions`, plain or `.jsonl.zst`), never modified. Windows are read with their own
  length (5h + weekly on paid plans, 30 days on Free).
- Claude Code bar: one more `Codex` line only when Codex was used in the last 24 hours (report: 7 days), with threshold and reset notifications
  (new setting `show_codex`, on by default; nothing changes without Codex).
- New setting `codex_compact` (`always` by default): Codex on one line, or one line per limit like Claude (`never`).
- `/limiti` report: Codex section with pace and daily budget; works with Codex data only too.
- `install.mjs --codex` installs a skill for Codex in `~/.agents/skills/limiti` (never automatic); `--remove` removes it. Someone else's `limiti` skill is never overwritten.

## 1.2.0 — 2026-11-10

- New setting `scheduled_reset` (Windows, off by default): when a limit passes the first threshold, a one-time Windows task shows the "limit reset" notification at the reset time even with every Claude Code session closed, then deletes itself. It shares the bar's marker, so the notification never arrives twice. Late by more than 30 minutes (computer off): it deletes itself silently.
- `install.mjs --remove` also deletes reset tasks still waiting.

## 1.1.2 — 2026-11-10

- Language "auto": on Windows the system language wins over LANG, which VS Code sets on its own (the bar was in English in the VS Code terminal).
- README: the VS Code graphical panel does not run custom status lines; use the integrated terminal or "Use Terminal".

## 1.1.1 — 2026-11-10

- Fix: notifications never showed when launched by Claude Code. They were started in the background and Claude Code ended them together with the status line. Now they are sent at the end and the status line waits for them (only when there is one to send).
- Tests now check that notifications are really sent, once per threshold and at reset.
- Durations with hours and minutes are written as `2h:58m` everywhere.

## 1.1.0 — 2026-11-10

- Simpler and safer rule with several sessions: a reading counts only if it is fresh (the session just got a response) or if nothing better is stored. A session seen for the first time can no longer bring old values back.
- Optional diagnostics log (`diagnostics true`) and `report.mjs diagnostics`, to check with real data the assumptions about Claude Code.
- Shorter skill description, so it weighs less in every conversation.
- docs/come-funziona.md: how it works, in plain Italian.
- Preview images no longer cut off.

## 1.0.0 — 2026-11-10

First public release.

- Status line with the 5-hour and weekly limits: bar, reset time, pace, forecast, daily budget.
- Notifications at thresholds and when a limit resets (Windows, macOS, Linux).
- `/limiti` skill: report with history, and settings changed by simply asking Claude.
- 7 bar styles, ASCII mode, color modes (auto, truecolor, 256, none), Italian and English.
- Lines shorten automatically to fit the terminal width.
- Safe with several Claude Code sessions open at once; a plan upgrade or account switch shows up immediately.
- Respects `CLAUDE_CONFIG_DIR`. Works with Bash or PowerShell as the shell tool.
- Installer that never overwrites someone else's status line and restores it on uninstall.
