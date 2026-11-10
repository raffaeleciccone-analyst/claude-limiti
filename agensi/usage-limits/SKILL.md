---
name: usage-limits
description: Live usage limits for Claude Code (5-hour and weekly) and OpenAI Codex. Shows how much is left, when it resets, pace and forecast, and sets up an always-visible status line with notifications. Use when the user asks how much usage is left, about rate limits or usage limits, or wants a usage-limits status line.
---

# Usage limits (claude-limiti)

This skill works with **claude-limiti**, a free, open-source (MIT) tool:
https://github.com/raffaeleciccone-analyst/claude-limiti

It runs locally only: no network connections, no dependencies, Node.js 18 or later. It reads the
limits that Claude Code passes to its status line and, for Codex, the limit lines in Codex's own
session files (`~/.codex/sessions`), never the messages.

Always reply in the user's language, in a few simple lines.

## 1. Is it installed?

Check whether one of these files exists:

- Claude Code: `~/.claude/skills/limiti/report.mjs`
- Codex: `~/.agents/skills/limiti/report.mjs`

If one exists, go to **Showing the limits**. Otherwise go to **Installing**.

## 2. Showing the limits

1. Run `node "<path of report.mjs found above>"`.
2. Summarize the output simply: for each limit, the percentage used, when it resets and whether
   the pace is fine. Put any history chart in a code block so it stays aligned.
3. If the output starts with `NO_DATA` or `NESSUN_DATO`: limits arrive after the first response of a
   session. Claude Code sends them only with a claude.ai Pro, Max or Ultra plan (`/usage` shows the
   same numbers); Codex writes them only when signed in with a ChatGPT account.
4. Give at most one tip, only when useful: if a limit will run out before it resets, suggest a
   lighter model or a lower effort for simple tasks; if everything is on pace, just say so.

To change how the status line looks, the installed `/limiti` skill handles it
(for example "/limiti change the bar style").

## 3. Installing (only after the user says yes)

Before running anything, tell the user in plain words what installing does, and ask for an
explicit yes:

- it downloads the project from GitHub into a folder of their choice;
- for Claude Code: copies the skill to `~/.claude/skills/limiti` and sets the `statusLine` entry in
  `~/.claude/settings.json` (a backup is saved once as `settings.json.bak-limiti`). If they already
  have a status line, the installer stops and changes nothing;
- for Codex: only copies a skill to `~/.agents/skills/limiti`; Codex itself is not changed;
- it can be removed at any time with `node install.mjs --remove`.

Requirements: Node.js 18 or later (`node --version`) and git (`git --version`).

Steps, once the user agrees:

1. Clone the repository into the folder the user chose:
   `git clone https://github.com/raffaeleciccone-analyst/claude-limiti.git`
   Without git: tell the user to download the ZIP of the latest release from
   https://github.com/raffaeleciccone-analyst/claude-limiti/releases, extract it, and continue
   from that folder.
2. If the user wants to look at the code first, point them to the files in that folder and wait.
3. From the project folder run:
   - Claude Code: `node install.mjs`
   - Codex only: `node install.mjs --codex`
   - both: run both commands.
4. If the installer says another status line is already configured, explain the choice and run
   `node install.mjs --force` only if the user explicitly asks to replace it (the old one is saved
   and restored on uninstall).
5. Tell the user to restart Claude Code: the bars appear after the first response.

Updating later: `git pull`, then `node install.mjs` again (preferences are kept).

## Optional features

Mention them only if the user asks about notifications or customization:

- notifications at 80% and 95% and when a limit resets (Windows, macOS, Linux with notify-send);
- `scheduled_reset` (Windows, off by default): a one-time Windows scheduled task shows the "limit
  reset" notification even with every session closed, then deletes itself. Turn it on only after
  telling the user it creates that task and getting an explicit yes;
- with Codex in use, the Claude Code bar shows Claude and Codex rows with aligned columns.

Never change settings, replace a status line or create scheduled tasks without the user's
explicit agreement.
