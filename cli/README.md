# @profireaper/neural-cli

[![npm](https://img.shields.io/npm/v/@profireaper/neural-cli.svg)](https://www.npmjs.com/package/@profireaper/neural-cli)
[![license](https://img.shields.io/npm/l/@profireaper/neural-cli.svg)](LICENSE)

> Streaming command-line interface for your Neural Guide Sync AI brain.
> Chat with **live tool trace**, tail events with **neural watch**, schedule prompts with **neural cron**, propose-then-confirm with **neural do**, and pipe stdin into prompts.

## Install

```bash
npm install -g @profireaper/neural-cli
```

Or run from source:

```bash
git clone https://github.com/ProFireaper/neural-guide-sync.git
cd neural-guide-sync/cli
npm link
```

## Login

1. Mint a token at https://neural-guide-sync.lovable.app/admin → CLI Tokens.
2. Save it locally:

```bash
neural login --token nrl_xxxxxxxxxxxxxxxxxxxx
neural whoami
```

## Quick tour

```bash
# Streaming agent with inline tool trace (zoho, github, perplexity, cloudflare)
neural ask "what should I work on next?"
neural chat                            # interactive REPL

# Propose then confirm — natural language → single tool call
neural do "email john the q3 report"

# Live tail — agent runs, tool calls, suggestions, brain health
neural watch
neural watch --filter brain

# Schedule recurring prompts (5-field cron, UTC)
neural cron add "0 9 * * *" "summarize yesterday across all my projects" --name morning
neural cron list
neural cron toggle <id>

# Pipe stdin into a prompt — composable with any unix tool
cat error.log | neural ask "diagnose this" --json | jq -r .output

# Inspect data
neural projects
neural suggestions
neural db query agent_runs --eq status=complete --limit 10

# Connectors
neural zoho mail --limit 10
neural zoho send --to a@b.com --subject "Hi" --body "<p>hello</p>"
neural pplx "what's new with Cloudflare Workers?" --deep --recency week
neural cf zones
neural gh sync                         # trigger github sync hook

# Diagnostics
neural doctor
neural health
```

## Streaming and tool trace

`neural ask` and `neural chat` stream tokens via SSE. Each tool call is shown
inline with status (`⏵ running` → `✓ ok` / `✗ err`) and timing:

```
↳ xai · x-ai/grok-4 · run=83…
Looking up your active leads…
⏵ zoho_list_leads({"limit":5}) ✓ 412ms
And recent mail…
⏵ zoho_list_recent_mail({"limit":10}) ✓ 287ms

You have 4 hot leads and 3 unread replies. Top priority is the Anderson deal…

(x-ai/grok-4 · xai · 2 tools · 3214ms)
```

## Configuration

| File | Purpose |
|------|---------|
| `~/.neural/config.json` | url, token (chmod 600) |
| `~/.neural/history.jsonl` | every ask/chat/do entry |

Environment overrides: `NEURAL_URL`, `NEURAL_TOKEN`, `NEURAL_SUPABASE_URL`, `NEURAL_SUPABASE_KEY`.

## Shell completion

```bash
neural completion bash >> ~/.bashrc       # or zsh
```

## License

MIT © ProFireaper
