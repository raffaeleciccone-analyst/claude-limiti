# Agensi listing — usage-limits (free)

Paste these into the Agensi "Submit a Skill" form. Upload: `usage-limits.zip`.

## Title

Usage Limits — live Claude Code & Codex limits in your status line

## Price

Free

## Tags

claude-code, codex, status-line, usage-limits, rate-limits, productivity, developer-tools

## Listing description

Never get surprised by "limit reached" again.

This skill sets up and reads **claude-limiti**, a free open-source tool (MIT) that keeps your
Claude Code usage limits always in view:

- **Always-visible bars** for the 5-hour and weekly limits: percentage used, reset time and time left,
  green / yellow / red.
- **Pace and forecast**: are you burning faster than time passes? If you will run out before the
  reset, it tells you when.
- **Daily budget**: how much you can use per day until the weekly reset.
- **Notifications** at 80% and 95% and when a limit resets (Windows, macOS, Linux).
- **OpenAI Codex too (experimental)**: if you also use Codex, its limits appear in the same bar, with
  aligned Claude and Codex rows. Free plan (30-day window) and paid plans (5 hours + weekly).
- **On-demand report**: ask "how much usage is left?" and get status, pace, forecast and history.

Everything runs locally: no network connections, no dependencies, no telemetry. Node.js 18+.
Works on Windows, macOS and Linux, in any terminal including the VS Code integrated one.

The skill never installs anything on its own: it explains what installing changes and asks for your
explicit yes first. Source code, tests and changelog:
https://github.com/raffaeleciccone-analyst/claude-limiti

**Requirements:** Claude Code with a claude.ai Pro, Max or Ultra plan (with an API key Claude Code
does not provide subscription limits). For Codex: signed in with a ChatGPT account.

## Note for the reviewer (if the form has a field for it)

The ZIP contains only SKILL.md (instructions, no code). The tool itself is installed from the public
GitHub repository, only after the user agrees; the skill tells the agent to explain the changes first.
