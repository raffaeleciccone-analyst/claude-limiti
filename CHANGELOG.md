# Changelog

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
