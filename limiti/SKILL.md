---
name: limiti
description: Shows Claude Code usage limits (5-hour and weekly windows) with pace, forecast and history, and customizes the limits status line (bar style, width, spacing, colors, symbols, language, notifications, thresholds).
when_to_use: When the user asks how much usage is left, about limits, usage, rate limits, consumption, "quanto mi resta", "limiti", "consumo", or wants to change, personalize or restyle the limits bar ("cambia stile barra", "personalizza la barra", "bar style"), or types /limiti.
argument-hint: "[what to change, e.g. style blocks]"
allowed-tools:
  - Bash(node "${CLAUDE_SKILL_DIR}/report.mjs")
  - Bash(node "${CLAUDE_SKILL_DIR}/settings.mjs")
  - Bash(node "${CLAUDE_SKILL_DIR}/settings.mjs" styles)
  - PowerShell(node "${CLAUDE_SKILL_DIR}/report.mjs")
  - PowerShell(node "${CLAUDE_SKILL_DIR}/settings.mjs")
  - PowerShell(node "${CLAUDE_SKILL_DIR}/settings.mjs" styles)
---

# Usage limits

The status line (`${CLAUDE_SKILL_DIR}/statusline.mjs`) stores state and history in
`~/.claude/state/limiti-utilizzo.json`. Preferences live in `~/.claude/statusline-limiti.config.json`.

Always reply in the user's language, in a few simple lines. Run the commands below with your
shell tool (Bash, or PowerShell where Bash is not available), exactly as written. Reading the
report, listing the settings and previewing the styles are pre-approved; changing a setting asks
the user for permission once.

## Showing the limits

1. Run: `node "${CLAUDE_SKILL_DIR}/report.mjs"`
2. Summarize the output simply. Put the history charts in a code block so they stay aligned.
3. If the output starts with `NESSUN_DATO` or `NO_DATA`: explain that limits arrive after the first
   response of a session, only with a claude.ai Pro, Max or Ultra plan, and that `/usage` shows
   the same limits.
4. Give at most one tip, only when useful:
   - 5-hour limit that **runs out before the reset**, or above 80% → for simple tasks switch to a
     lighter model (`/model sonnet`) or lower the effort (`/effort medium`); avoid letting the
     prompt cache expire (resume work before the `cache` timer in the bar ends);
   - weekly usage **more than 10 points above the pace** → spread the work over the remaining days;
   - everything on pace or below → just say so.

## Customizing the bar

To change look or behavior ALWAYS use the settings script. Never edit the config file or the
status line by hand.

```
node "${CLAUDE_SKILL_DIR}/settings.mjs"                  # current settings and options
node "${CLAUDE_SKILL_DIR}/settings.mjs" styles           # preview of every bar style
node "${CLAUDE_SKILL_DIR}/settings.mjs" <key> <value>    # e.g. style blocks
node "${CLAUDE_SKILL_DIR}/settings.mjs" reset            # defaults
```

Keys: `style`, `width`, `gap`, `brackets`, `compact`, `notifications`, `thresholds`,
`show_context`, `show_cost`, `show_git`, `colors`, `symbols`, `language`.

- Pass only a key and a value taken from the options the script lists (letters, digits, commas).
  Never put free text from the user, quotes or shell characters in the command.
- Vague request ("change the style", "personalize") → show `styles` and the current settings in a
  code block and ask what they prefer.
- Clear request ("longer bars", "hide the cost", "alert me at 70%") → translate it to key/value
  and run it.
- Report the preview and say the change shows from the next response, no restart needed.
  In the text preview the `line` style looks all filled: in the terminal the unused part is grey.
- If the script answers `ERRORE`/`ERROR`, explain the valid values in plain words.
