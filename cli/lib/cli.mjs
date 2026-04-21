/**
 * Neural CLI dispatcher.
 *
 * Subcommands:
 *   login [--url <u>] [--token <t>]
 *   logout
 *   whoami
 *   health
 *   tools [list|run <name> [--args '<json>']]
 *   ask "<prompt>"            [--agent <slug>] [--model <model>] [--json] [--no-stream]
 *   chat                      interactive REPL (streaming + tool trace)
 *   do "<natural language>"   propose-then-confirm tool call
 *   watch [--filter agents|tools|suggestions|brain] [--user <id>]
 *   pipe "<prompt>"           stdin → prompt prefix; stdout = answer (alias for ask --json | jq .output)
 *   db query <table> [--eq col=val ...] [--limit N] [--select cols] [--json]
 *   db insert <table> --row '<json>'
 *   cron list | add "<cron>" "<prompt>" [--name N] [--agent slug] [--model m] | toggle <id> | rm <id> | run <id>
 *   cron run github-sync       (one-shot job)
 *   projects [--json]
 *   suggestions [--json]
 *   zoho mail [--limit N]
 *   zoho leads | deals | contacts | tasks [--limit N]
 *   zoho send --to ... --subject ... --body ...
 *   gh sync                   alias for `cron run github-sync`
 *   pplx "<query>" [--deep] [--recency week|day|month|year]
 *   cf zones | cf dns <zone_id> | cf purge <zone_id>
 *   completion bash|zsh       prints completion script
 *   doctor                    diagnoses connectivity, auth, brain health
 *   version
 */
import { createInterface } from "node:readline";
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { saveConfig, requireToken } from "./config.mjs";
import { apiFetch, apiStream } from "./api.mjs";
import { version as PKG_VERSION } from "../package.json" with { type: "json" };

const isTTY = process.stdout.isTTY;
const c = isTTY ? {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", gray: "\x1b[90m",
} : new Proxy({}, { get: () => "" });

const log = (...a) => console.log(...a);
const ok = (...a) => log(c.green + "✓" + c.reset, ...a);
const info = (...a) => log(c.cyan + "•" + c.reset, ...a);
const warn = (...a) => log(c.yellow + "!" + c.reset, ...a);
const err = (...a) => log(c.red + "✗" + c.reset, ...a);

// ──────────────────────────────────────────────────────────────────────
// History
// ──────────────────────────────────────────────────────────────────────

const HISTORY_DIR = join(homedir(), ".neural");
const HISTORY_FILE = join(HISTORY_DIR, "history.jsonl");

function appendHistory(entry) {
  try {
    if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true, mode: 0o700 });
    appendFileSync(HISTORY_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n", { mode: 0o600 });
  } catch { /* best-effort */ }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function parseFlags(argv) {
  const flags = {}; const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) { flags[key] = true; }
      else { flags[key] = next; i++; }
    } else { positional.push(a); }
  }
  return { flags, positional };
}

function printJSON(obj) { log(JSON.stringify(obj, null, 2)); }

function printTable(rows, cols) {
  if (!rows?.length) { info("(empty)"); return; }
  const widths = cols.map((col) => Math.max(col.length, ...rows.map((r) => String(r[col] ?? "").length)));
  const fmt = (vals) => vals.map((v, i) => String(v ?? "").padEnd(widths[i])).join("  ");
  log(c.bold + fmt(cols) + c.reset);
  log(c.dim + widths.map((w) => "─".repeat(w)).join("  ") + c.reset);
  for (const r of rows) log(fmt(cols.map((col) => r[col])));
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.trim();
}

// ──────────────────────────────────────────────────────────────────────
// Help
// ──────────────────────────────────────────────────────────────────────

const HELP = `${c.bold}neural${c.reset} v${PKG_VERSION} — command-line interface for your AI super-brain

${c.bold}Auth${c.reset}
  neural login --token nrl_xxx [--url https://neural-guide-sync.lovable.app]
  neural whoami / logout

${c.bold}Health & tools${c.reset}
  neural doctor                  end-to-end diagnostic
  neural health                  brain + auxiliary providers
  neural tools                   list available tools
  neural tools run <name> --args '{"limit":5}'

${c.bold}Agent (streaming)${c.reset}
  neural ask "your question"     [--agent ceo-grok] [--model x-ai/grok-4] [--no-stream]
  neural chat                    interactive REPL with live tool trace
  neural do "email john the report"   propose then confirm
  echo "logs..." | neural ask "diagnose this"  pipe stdin into the prompt

${c.bold}Live tail${c.reset}
  neural watch                   tail agent runs, tool calls, suggestions
  neural watch --filter brain    only brain health changes

${c.bold}Data${c.reset}
  neural projects [--json]
  neural suggestions [--json]
  neural db query projects --limit 10 --select id,name,status [--json]
  neural db query agent_runs --eq status=complete --limit 5
  neural db insert projects --row '{"name":"My new project"}'

${c.bold}Cron${c.reset}
  neural cron list
  neural cron add "0 9 * * *" "summarize yesterday" --name morning
  neural cron toggle <id>
  neural cron rm <id>
  neural cron run github-sync    (one-shot job)
  neural gh sync                 (alias)

${c.bold}Zoho${c.reset}
  neural zoho mail --limit 10
  neural zoho leads | deals | contacts | tasks
  neural zoho send --to a@b.com --subject "..." --body "<p>hi</p>"

${c.bold}Perplexity${c.reset}
  neural pplx "what's new with Cloudflare Workers?" --deep --recency week

${c.bold}Cloudflare${c.reset}
  neural cf zones | dns <zone_id> | purge <zone_id>

${c.bold}Shell${c.reset}
  neural completion bash|zsh > ~/.neural-completion && source it

${c.dim}Config: ~/.neural/config.json   ·   History: ~/.neural/history.jsonl${c.reset}
${c.dim}Override URL: NEURAL_URL   ·   Override token: NEURAL_TOKEN${c.reset}`;

// ──────────────────────────────────────────────────────────────────────
// Dispatcher
// ──────────────────────────────────────────────────────────────────────

export async function run(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") { log(HELP); return; }
  if (cmd === "version" || cmd === "--version" || cmd === "-v") { log(`neural ${PKG_VERSION}`); return; }

  switch (cmd) {
    case "login":      return cmdLogin(rest);
    case "logout":     return cmdLogout();
    case "whoami":     return cmdWhoami();
    case "doctor":     return cmdDoctor();
    case "health":     return cmdHealth();
    case "tools":      return cmdTools(rest);
    case "ask":        return cmdAsk(rest);
    case "chat":       return cmdChat(rest);
    case "do":         return cmdDo(rest);
    case "watch":      return cmdWatch(rest);
    case "db":         return cmdDb(rest);
    case "cron":       return cmdCron(rest);
    case "projects":   return cmdProjects(rest);
    case "suggestions":return cmdSuggestions(rest);
    case "zoho":       return cmdZoho(rest);
    case "gh":         return cmdGh(rest);
    case "pplx":       return cmdPplx(rest);
    case "cf":         return cmdCf(rest);
    case "completion": return cmdCompletion(rest);
    default:
      throw new Error(`Unknown command: ${cmd}\nRun 'neural help' for the list.`);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────────────────────────

async function cmdLogin(args) {
  const { flags } = parseFlags(args);
  let { url, token } = flags;
  if (!token) {
    info("Paste your CLI token (from /admin → CLI Tokens).");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    token = await new Promise((r) => rl.question("token (nrl_…): ", (a) => { rl.close(); r(a.trim()); }));
  }
  const patch = {};
  if (url) patch.url = url;
  if (token) patch.token = token;
  const cfg = saveConfig(patch);
  ok(`Saved to ~/.neural/config.json (url=${cfg.url})`);
  try {
    const me = await apiFetch(cfg, "GET", "whoami");
    ok(`Logged in as ${c.bold}${me.email ?? me.user_id}${c.reset}`);
  } catch (e) {
    warn(`Token saved but validation failed: ${e.message}`);
  }
}

async function cmdLogout() {
  saveConfig({ token: undefined });
  ok("Logged out (token cleared from ~/.neural/config.json)");
}

async function cmdWhoami() {
  const cfg = requireToken();
  const me = await apiFetch(cfg, "GET", "whoami");
  printJSON(me);
}

async function cmdDoctor() {
  log(c.bold + "Neural CLI doctor" + c.reset);
  const cfg = requireToken();
  log(`  url:   ${c.cyan}${cfg.url}${c.reset}`);
  log(`  token: ${c.cyan}${cfg.token.slice(0, 12)}…${c.reset}`);
  try {
    const me = await apiFetch(cfg, "GET", "whoami");
    ok(`auth: ${me.email ?? me.user_id}`);
  } catch (e) { err(`auth failed: ${e.message}`); return; }
  try {
    const h = await apiFetch(cfg, "GET", "health");
    for (const b of h.brains) {
      const color = b.status === "ok" ? c.green : b.status === "degraded" ? c.yellow : c.red;
      log(`  brain ${color}${b.status.padEnd(12)}${c.reset} ${b.label}  ${c.dim}(${b.latency_ms ?? "?"}ms)${c.reset}`);
    }
    for (const a of h.auxiliary) {
      const color = a.status === "ok" ? c.green : a.status === "degraded" ? c.yellow : c.red;
      log(`  aux   ${color}${a.status.padEnd(12)}${c.reset} ${a.label}`);
    }
  } catch (e) { err(`health failed: ${e.message}`); }
  ok("doctor complete");
}

async function cmdHealth() {
  const cfg = requireToken();
  const h = await apiFetch(cfg, "GET", "health");
  log(c.bold + "Brains" + c.reset);
  printTable(h.brains, ["provider", "model", "status", "http", "latency_ms"]);
  log("");
  log(c.bold + "Auxiliary" + c.reset);
  printTable(h.auxiliary, ["id", "label", "status", "http", "latency_ms"]);
}

// ──────────────────────────────────────────────────────────────────────
// Tools
// ──────────────────────────────────────────────────────────────────────

async function cmdTools(args) {
  const cfg = requireToken();
  const sub = args[0];
  if (!sub || sub === "list") {
    const { tools } = await apiFetch(cfg, "GET", "tools");
    for (const t of tools) {
      log(`${c.cyan}${t.name}${c.reset}  ${c.dim}${t.description}${c.reset}`);
    }
    return;
  }
  if (sub === "run") {
    const name = args[1];
    if (!name) throw new Error("Usage: neural tools run <name> [--args '<json>']");
    const { flags } = parseFlags(args.slice(2));
    let parsedArgs = {};
    if (flags.args) { try { parsedArgs = JSON.parse(flags.args); } catch { throw new Error("--args must be valid JSON"); } }
    const r = await apiFetch(cfg, "POST", "tools/run", { name, args: parsedArgs });
    printJSON(r);
    return;
  }
  throw new Error("Usage: neural tools [list|run <name>]");
}

// ──────────────────────────────────────────────────────────────────────
// Ask / Chat (streaming)
// ──────────────────────────────────────────────────────────────────────

const STATUS_GLYPHS = {
  running: c.yellow + "⏵" + c.reset,
  ok: c.green + "✓" + c.reset,
  err: c.red + "✗" + c.reset,
};

async function streamAndRender(cfg, body, { showTrace = true, onDone } = {}) {
  let answer = "";
  let runMeta = null;
  const toolCalls = [];

  await apiStream(cfg, body, ({ event, data }) => {
    if (event === "meta") {
      runMeta = data;
      if (showTrace) log(c.dim + `↳ ${data.provider} · ${data.model} · run=${data.run_id}` + c.reset);
    } else if (event === "token") {
      process.stdout.write(c.bold + data.delta + c.reset);
      answer += data.delta;
    } else if (event === "tool_call") {
      if (showTrace) {
        process.stdout.write(`\n${STATUS_GLYPHS.running} ${c.cyan}${data.name}${c.reset}${c.dim}(${JSON.stringify(data.args).slice(0, 80)})${c.reset} `);
      }
      toolCalls.push({ name: data.name, args: data.args });
    } else if (event === "tool_result") {
      if (showTrace) {
        const glyph = data.ok ? STATUS_GLYPHS.ok : STATUS_GLYPHS.err;
        process.stdout.write(`${glyph} ${c.dim}${data.ms}ms${c.reset}\n`);
        if (!data.ok && data.error) log(c.red + "  " + data.error + c.reset);
      }
    } else if (event === "fallback") {
      if (showTrace) log(c.yellow + `\n  fallback: ${data.provider}=${data.status} ${data.error?.slice(0, 80) ?? ""}` + c.reset);
    } else if (event === "done") {
      process.stdout.write("\n");
      if (showTrace) {
        log(c.dim + `(${data.model} · ${data.provider} · ${data.tool_calls?.length ?? 0} tools · ${data.ms}ms)` + c.reset);
      }
      if (onDone) onDone(data);
    } else if (event === "error") {
      err(data.message);
    }
  });

  return { answer, meta: runMeta, toolCalls };
}

async function cmdAsk(args) {
  const cfg = requireToken();
  const { flags, positional } = parseFlags(args);
  let prompt = positional.join(" ");
  const stdin = await readStdin();
  if (stdin) prompt = prompt ? `${prompt}\n\n${stdin}` : stdin;
  if (!prompt) throw new Error('Usage: neural ask "<prompt>" [--agent slug] [--model model] [--json] [--no-stream]');

  const body = { prompt, agent_slug: flags.agent, model: flags.model };

  if (flags.json || flags["no-stream"]) {
    const r = await apiFetch(cfg, "POST", "agent/run", body);
    if (flags.json) { printJSON(r); appendHistory({ kind: "ask", prompt, output: r.output }); return; }
    log(r.output);
    log(c.dim + `(${r.model} · ${r.provider} · ${r.tool_calls?.length ?? 0} tools)` + c.reset);
    appendHistory({ kind: "ask", prompt, output: r.output });
    return;
  }

  const { answer } = await streamAndRender(cfg, body);
  appendHistory({ kind: "ask", prompt, output: answer });
}

async function cmdChat(args) {
  const cfg = requireToken();
  const { flags } = parseFlags(args);
  let agent_slug = flags.agent ?? "ceo-grok";
  let model = flags.model;

  ok(`neural chat — agent=${agent_slug}${model ? ` model=${model}` : ""}`);
  log(c.dim + "  /quit · /agent <slug> · /model <m> · /clear · /save <file>" + c.reset);

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: `${c.cyan}you›${c.reset} ` });
  rl.prompt();
  const transcript = [];

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }
    if (trimmed === "/quit" || trimmed === "/exit") { rl.close(); return; }
    if (trimmed.startsWith("/agent ")) { agent_slug = trimmed.slice(7).trim(); ok(`agent → ${agent_slug}`); rl.prompt(); return; }
    if (trimmed.startsWith("/model ")) { model = trimmed.slice(7).trim() || undefined; ok(`model → ${model ?? "(default)"}`); rl.prompt(); return; }
    if (trimmed === "/clear") { console.clear(); rl.prompt(); return; }
    if (trimmed.startsWith("/save ")) {
      const f = trimmed.slice(6).trim();
      try {
        appendFileSync(f, transcript.map((m) => `${m.role.toUpperCase()}: ${m.content}\n`).join("\n"));
        ok(`saved to ${f}`);
      } catch (e) { err(e.message); }
      rl.prompt();
      return;
    }

    transcript.push({ role: "user", content: trimmed });
    process.stdout.write(`${c.magenta}brain›${c.reset} `);
    try {
      const { answer } = await streamAndRender(cfg, { prompt: trimmed, agent_slug, model });
      transcript.push({ role: "assistant", content: answer });
      appendHistory({ kind: "chat", prompt: trimmed, output: answer, agent_slug });
    } catch (e) {
      err(e.message);
    }
    rl.prompt();
  });

  rl.on("close", () => { ok("bye"); process.exit(0); });
}

async function cmdDo(args) {
  const cfg = requireToken();
  const intent = args.join(" ");
  if (!intent) throw new Error('Usage: neural do "natural language instruction"');

  // Use the agent in plan-only mode by adding a steering message that tells it
  // to propose tool calls and STOP. We achieve this by asking for JSON output.
  info("Planning…");
  const r = await apiFetch(cfg, "POST", "agent/run", {
    prompt: `You are a planner. Look at this intent and respond with ONLY a JSON object {"tool":"<name>","args":{...},"why":"..."} that achieves it. If multiple tools are needed pick the FIRST. Intent: ${intent}`,
    agent_slug: "ceo-grok",
  });
  let plan = null;
  try {
    const m = r.output.match(/\{[\s\S]*\}/);
    plan = m ? JSON.parse(m[0]) : null;
  } catch {}
  if (!plan?.tool) { warn("could not parse a plan; raw answer:"); log(r.output); return; }

  log(c.bold + "Proposed tool call:" + c.reset);
  log(`  ${c.cyan}${plan.tool}${c.reset}(${JSON.stringify(plan.args, null, 2)})`);
  if (plan.why) log(c.dim + `  why: ${plan.why}` + c.reset);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const yes = await new Promise((res) => rl.question("execute? [y/N] ", (a) => { rl.close(); res(/^y(es)?$/i.test(a.trim())); }));
  if (!yes) { warn("aborted"); return; }
  const exec = await apiFetch(cfg, "POST", "tools/run", { name: plan.tool, args: plan.args });
  printJSON(exec);
  appendHistory({ kind: "do", intent, plan, exec });
}

// ──────────────────────────────────────────────────────────────────────
// Watch (live tail)
// ──────────────────────────────────────────────────────────────────────

async function cmdWatch(args) {
  const { flags } = parseFlags(args);
  const filter = String(flags.filter ?? "all");
  const cfg = requireToken();

  // Pull supabase config from /api/cli/whoami extension OR fallback to known prod values.
  // We use the publishable (anon) key which is safe to ship; RLS still applies.
  const supabaseUrl = process.env.NEURAL_SUPABASE_URL ?? "https://cldgrtzmlykoeahxkhuq.supabase.co";
  const supabaseKey = process.env.NEURAL_SUPABASE_KEY ?? "sb_publishable_7jrg9P1F1_g72lcUdtUwuA_vBhkgm4T";

  // We need a real auth session for RLS — exchange the CLI token for the user_id and
  // simply listen to channels filtered by user_id. Since we don't have a user JWT
  // we use anon + filter manually; the brain_health table is publicly readable.
  const me = await apiFetch(cfg, "GET", "whoami");
  const userId = me.user_id;
  ok(`Tailing live events for ${me.email ?? userId} ${filter !== "all" ? `(filter=${filter})` : ""}`);
  log(c.dim + "Press Ctrl+C to stop.\n" + c.reset);

  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const should = (kind) => filter === "all" || filter === kind;

  if (should("agents")) {
    sb.channel("watch-runs")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_runs", filter: `user_id=eq.${userId}` }, (p) => {
        const row = p.new ?? p.old;
        const status = row.status === "complete" ? c.green : row.status === "error" ? c.red : c.yellow;
        log(`${c.dim}${new Date().toLocaleTimeString()}${c.reset} ${c.cyan}agent_run${c.reset} ${status}${row.status}${c.reset} ${c.dim}${row.model}${c.reset} ${(row.prompt ?? "").slice(0, 80)}`);
      })
      .subscribe();
  }
  if (should("tools")) {
    sb.channel("watch-tools")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_tool_calls", filter: `user_id=eq.${userId}` }, (p) => {
        const row = p.new;
        const glyph = row.status === "complete" ? c.green + "✓" : c.red + "✗";
        log(`${c.dim}${new Date().toLocaleTimeString()}${c.reset} ${c.magenta}tool${c.reset}      ${glyph}${c.reset} ${row.tool_name} ${c.dim}${row.duration_ms}ms${c.reset}`);
      })
      .subscribe();
  }
  if (should("suggestions")) {
    sb.channel("watch-sugg")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "suggestions", filter: `user_id=eq.${userId}` }, (p) => {
        log(`${c.dim}${new Date().toLocaleTimeString()}${c.reset} ${c.yellow}suggest${c.reset}   ${c.bold}${p.new.title}${c.reset}`);
      })
      .subscribe();
  }
  if (should("brain")) {
    sb.channel("watch-brain")
      .on("postgres_changes", { event: "*", schema: "public", table: "brain_health" }, (p) => {
        const row = p.new ?? p.old;
        const color = row.status === "ok" ? c.green : row.status === "degraded" ? c.yellow : c.red;
        log(`${c.dim}${new Date().toLocaleTimeString()}${c.reset} ${c.blue}brain${c.reset}     ${color}${row.status}${c.reset} ${row.provider} ${c.dim}${row.latency_ms ?? "?"}ms${c.reset}`);
      })
      .subscribe();
  }

  // keep alive
  await new Promise(() => {});
}

// ──────────────────────────────────────────────────────────────────────
// DB
// ──────────────────────────────────────────────────────────────────────

async function cmdDb(args) {
  const cfg = requireToken();
  const sub = args[0];
  if (sub === "query") {
    const table = args[1];
    if (!table) throw new Error("Usage: neural db query <table> [--eq col=val] [--limit N] [--select cols] [--json]");
    const { flags } = parseFlags(args.slice(2));
    const eq = {};
    if (flags.eq) {
      const pairs = Array.isArray(flags.eq) ? flags.eq : [flags.eq];
      for (const p of pairs) { const [k, v] = String(p).split("="); if (k) eq[k] = v; }
    }
    const r = await apiFetch(cfg, "POST", "db/query", {
      table,
      select: flags.select ?? "*",
      eq,
      limit: flags.limit ? Number(flags.limit) : 50,
    });
    if (flags.json) { printJSON(r); return; }
    if (!r.rows?.length) { info("no rows"); return; }
    const cols = Object.keys(r.rows[0]).slice(0, 6);
    printTable(r.rows.map((row) => Object.fromEntries(cols.map((k) => [k, typeof row[k] === "object" ? JSON.stringify(row[k]).slice(0, 40) : row[k]]))), cols);
    log(c.dim + `${r.count} rows` + c.reset);
    return;
  }
  if (sub === "insert") {
    const table = args[1];
    const { flags } = parseFlags(args.slice(2));
    if (!table || !flags.row) throw new Error("Usage: neural db insert <table> --row '<json>'");
    const row = JSON.parse(flags.row);
    const r = await apiFetch(cfg, "POST", "db/insert", { table, row });
    printJSON(r);
    return;
  }
  throw new Error("Usage: neural db [query|insert] ...");
}

// ──────────────────────────────────────────────────────────────────────
// Cron
// ──────────────────────────────────────────────────────────────────────

async function cmdCron(args) {
  const cfg = requireToken();
  const sub = args[0];
  if (sub === "run") {
    if (!args[1]) throw new Error("Usage: neural cron run <job-or-id>");
    // System jobs (github-sync, run-cli-schedules) vs user schedule id
    if (args[1].includes("-") && args[1].length < 36) {
      const r = await apiFetch(cfg, "POST", "cron/run", { job: args[1] });
      printJSON(r);
      return;
    }
    const r = await apiFetch(cfg, "POST", "schedules/run", { id: args[1] });
    printJSON(r);
    return;
  }
  if (!sub || sub === "list") {
    const r = await apiFetch(cfg, "GET", "schedules");
    if (!r.schedules?.length) { info("no schedules. add one with: neural cron add \"0 9 * * *\" \"summarize yesterday\""); return; }
    printTable(r.schedules.map((s) => ({
      id: s.id.slice(0, 8),
      name: s.name,
      cron: s.cron,
      enabled: s.enabled ? "✓" : "·",
      last: s.last_run_at?.slice(11, 16) ?? "—",
      status: s.last_status ?? "—",
    })), ["id", "name", "cron", "enabled", "last", "status"]);
    return;
  }
  if (sub === "add") {
    const cron = args[1]; const prompt = args[2];
    if (!cron || !prompt) throw new Error('Usage: neural cron add "<cron>" "<prompt>" [--name N] [--agent slug] [--model m]');
    const { flags } = parseFlags(args.slice(3));
    const r = await apiFetch(cfg, "POST", "schedules", {
      name: flags.name ?? `Schedule ${new Date().toISOString().slice(0, 10)}`,
      cron, prompt,
      agent_slug: flags.agent ?? "ceo-grok",
      model: flags.model ?? null,
    });
    ok(`Created schedule ${r.schedule.id.slice(0, 8)} (${r.schedule.cron})`);
    return;
  }
  if (sub === "toggle") {
    const id = args[1]; if (!id) throw new Error("Usage: neural cron toggle <id>");
    const r = await apiFetch(cfg, "POST", "schedules/toggle", { id });
    printJSON(r);
    return;
  }
  if (sub === "rm") {
    const id = args[1]; if (!id) throw new Error("Usage: neural cron rm <id>");
    const r = await apiFetch(cfg, "POST", "schedules/delete", { id });
    printJSON(r);
    return;
  }
  throw new Error("Usage: neural cron [list|add|toggle|rm|run] ...");
}

// ──────────────────────────────────────────────────────────────────────
// Lists
// ──────────────────────────────────────────────────────────────────────

async function cmdProjects(args) {
  const cfg = requireToken();
  const { flags } = parseFlags(args);
  const { projects } = await apiFetch(cfg, "GET", "projects");
  if (flags.json) return printJSON(projects);
  printTable(projects.map((p) => ({
    name: p.name?.slice(0, 40), status: p.status, pri: p.priority,
    tags: (p.tags ?? []).slice(0, 2).join(","),
    last: p.last_worked_on?.slice(0, 10) ?? "",
  })), ["name", "status", "pri", "tags", "last"]);
  log(c.dim + `${projects.length} projects` + c.reset);
}

async function cmdSuggestions(args) {
  const cfg = requireToken();
  const { flags } = parseFlags(args);
  const { suggestions } = await apiFetch(cfg, "GET", "suggestions");
  if (flags.json) return printJSON(suggestions);
  for (const s of suggestions) {
    log(`${c.bold}${s.title}${c.reset}  ${c.dim}[${s.kind}]${c.reset}`);
    log(c.dim + s.body.slice(0, 240) + (s.body.length > 240 ? "…" : "") + c.reset);
    log("");
  }
  log(c.dim + `${suggestions.length} open suggestions` + c.reset);
}

// ──────────────────────────────────────────────────────────────────────
// Connectors
// ──────────────────────────────────────────────────────────────────────

async function cmdZoho(args) {
  const cfg = requireToken();
  const sub = args[0];
  const { flags } = parseFlags(args.slice(1));
  const limit = flags.limit ? Number(flags.limit) : 10;
  if (sub === "mail") {
    const r = await apiFetch(cfg, "POST", "tools/run", { name: "zoho_list_recent_mail", args: { limit } });
    const msgs = r.result?.messages ?? [];
    for (const m of msgs) log(`${c.cyan}${(m.fromAddress ?? "?").slice(0, 30).padEnd(30)}${c.reset} ${(m.subject ?? "").slice(0, 80)}`);
    log(c.dim + `${msgs.length} messages from ${r.result?.accountEmail ?? "?"}` + c.reset);
    return;
  }
  if (sub === "leads")    return printJSON((await apiFetch(cfg, "POST", "tools/run", { name: "zoho_list_leads", args: { limit } })).result);
  if (sub === "deals")    return printJSON((await apiFetch(cfg, "POST", "tools/run", { name: "zoho_list_deals", args: { limit } })).result);
  if (sub === "contacts") return printJSON((await apiFetch(cfg, "POST", "tools/run", { name: "zoho_list_contacts", args: { limit } })).result);
  if (sub === "tasks")    return printJSON((await apiFetch(cfg, "POST", "tools/run", { name: "zoho_list_tasks", args: { limit } })).result);
  if (sub === "send") {
    if (!flags.to || !flags.subject || !flags.body) throw new Error("Usage: neural zoho send --to a@b.com --subject ... --body ...");
    const r = await apiFetch(cfg, "POST", "tools/run", { name: "zoho_send_mail", args: { to: flags.to, subject: flags.subject, body: flags.body } });
    printJSON(r);
    return;
  }
  throw new Error("Usage: neural zoho [mail|leads|deals|contacts|tasks|send] ...");
}

async function cmdGh(args) {
  if (args[0] !== "sync") throw new Error("Usage: neural gh sync");
  const cfg = requireToken();
  const r = await apiFetch(cfg, "POST", "cron/run", { job: "github-sync" });
  printJSON(r);
}

async function cmdPplx(args) {
  const cfg = requireToken();
  const { flags, positional } = parseFlags(args);
  const query = positional.join(" ");
  if (!query) throw new Error('Usage: neural pplx "<query>" [--deep] [--recency week]');
  const r = await apiFetch(cfg, "POST", "tools/run", {
    name: "web_research",
    args: { query, deep: !!flags.deep, recency: flags.recency ?? "week" },
  });
  log(c.bold + (r.result?.answer ?? "") + c.reset);
  if (r.result?.citations?.length) {
    log("");
    log(c.dim + "sources:" + c.reset);
    r.result.citations.forEach((u, i) => log(c.dim + ` [${i + 1}] ${u}` + c.reset));
  }
}

async function cmdCf(args) {
  const cfg = requireToken();
  const sub = args[0];
  if (sub === "zones") {
    const r = await apiFetch(cfg, "POST", "tools/run", { name: "cloudflare_list_zones", args: {} });
    printTable(r.result?.zones ?? [], ["id", "name", "status", "plan"]);
    return;
  }
  if (sub === "dns") {
    const zone = args[1]; if (!zone) throw new Error("Usage: neural cf dns <zone_id>");
    const r = await apiFetch(cfg, "POST", "tools/run", { name: "cloudflare_list_dns", args: { zone_id: zone } });
    printTable(r.result?.records ?? [], ["type", "name", "content", "proxied", "ttl"]);
    return;
  }
  if (sub === "purge") {
    const zone = args[1]; if (!zone) throw new Error("Usage: neural cf purge <zone_id>");
    const r = await apiFetch(cfg, "POST", "tools/run", { name: "cloudflare_purge_cache", args: { zone_id: zone } });
    printJSON(r);
    return;
  }
  throw new Error("Usage: neural cf [zones|dns <zone_id>|purge <zone_id>]");
}

// ──────────────────────────────────────────────────────────────────────
// Completion
// ──────────────────────────────────────────────────────────────────────

const COMPLETIONS = "login logout whoami doctor health tools ask chat do watch db cron projects suggestions zoho gh pplx cf completion version help";

function cmdCompletion(args) {
  const shell = args[0];
  if (shell === "bash") {
    log(`# neural bash completion — source this file
_neural_complete() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${COMPLETIONS}" -- "$cur") )
  fi
}
complete -F _neural_complete neural`);
    return;
  }
  if (shell === "zsh") {
    log(`#compdef neural
_neural() { compadd ${COMPLETIONS} }
compdef _neural neural`);
    return;
  }
  throw new Error("Usage: neural completion bash|zsh");
}
