# neural-cli

Command-line companion for the Neural Guide Sync brain. Runs every agent tool
(Zoho, GitHub, Perplexity, Cloudflare, Lovable AI), queries your data,
triggers cron jobs, and chats with your agents — straight from your terminal.

## Install

```bash
# From the repo (until published to npm):
cd cli && npm link
# now you have `neural` on your PATH

# Or install directly from the cloned repo path:
npm i -g ./cli
```

Once published:

```bash
npm i -g @profireaper/neural-cli
```

## Login

1. Open the app → **/admin → CLI Tokens** → **Create token** → copy the `nrl_…` value.
2. Run:

```bash
neural login
# paste the token when prompted, or:
neural login --token nrl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Your config lives at `~/.neural/config.json` (chmod 600). Override at runtime
with `NEURAL_TOKEN` and `NEURAL_URL` env vars.

## Quick tour

```bash
neural whoami
neural health
neural tools                                 # list every tool
neural ask "summarize my open suggestions"   # full agentic run with tool-calling
neural chat                                  # interactive REPL

neural projects
neural suggestions
neural db query projects --limit 5 --select id,name,status

neural zoho mail --limit 10
neural zoho leads
neural zoho send --to a@b.com --subject "hi" --body "<p>hello</p>"

neural pplx "latest CF Workers limits" --deep --recency week
neural cf zones
neural gh sync                               # re-sync all your GitHub repos
```

Run `neural help` to see the full list.
