# Changelog

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
