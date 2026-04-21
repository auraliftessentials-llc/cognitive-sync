/**
 * Neural CLI dispatcher.
 * Subcommands:
 *   login [--url <u>] [--token <t>]
 *   whoami
 *   health
 *   tools [list|run <name> [--args '<json>']]
 *   ask "<prompt>" [--agent <slug>] [--model <model>]
 *   chat                          (interactive REPL)
 *   db query <table> [--eq col=val ...] [--limit N] [--select cols]
 *   db insert <table> --row '<json>'
 *   cron run <job>                (job=github-sync)
 *   projects                      (list)
 *   suggestions                   (list)
 *   zoho mail [--limit N]
 *   zoho leads [--limit N]
 *   zoho deals [--limit N]
 *   zoho send --to ... --subject ... --body ...
 *   gh sync                       (alias for `cron run github-sync`)
 *   pplx "<query>" [--deep] [--recency week|day|month|year]
 *   cf zones | cf dns <zone_id> | cf purge <zone_id>
 */
import { createInterface } from "node:readline";
import { loadConfig, saveConfig, requireToken } from "./config.mjs";
import { apiFetch } from "./api.mjs";

const c = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m",
};
const log = (...a) => console.log(...a);
const ok = (...a) => log(c.green + "✓" + c.reset, ...a);
const info = (...a) => log(c.cyan + "•" + c.reset, ...a);
const warn = (...a) => log(c.yellow + "!" + c.reset, ...a);

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

function printJSON(obj) {
  log(JSON.stringify(obj, null, 2));
}

function printTable(rows, cols) {
  if (!rows?.length) { info("(empty)"); return; }
  const widths = cols.map((col) => Math.max(col.length, ...rows.map((r) => String(r[col] ?? "").length)));
  const fmt = (vals) => vals.map((v, i) => String(v ?? "").padEnd(widths[i])).join("  ");
  log(c.bold + fmt(cols) + c.reset);
  log(c.dim + widths.map((w) => "─".repeat(w)).join("  ") + c.reset);
  for (const r of rows) log(fmt(cols.map((col) => r[col])));
}

const HELP = `${c.bold}neural${c.reset} — command-line interface for your AI super-brain

${c.bold}Auth${c.reset}
  neural login --token nrl_xxx [--url https://neural-guide-sync.lovable.app]
  neural whoami

${c.bold}Health & tools${c.reset}
  neural health
  neural tools                  list available tools
  neural tools run <name> --args '{"limit":5}'

${c.bold}Agent${c.reset}
  neural ask "your question"     [--agent ceo-grok] [--model x-ai/grok-4]
  neural chat                    interactive REPL

${c.bold}Data${c.reset}
  neural projects
  neural suggestions
  neural db query projects --limit 10 --select id,name,status
  neural db query agent_runs --eq status=complete --limit 5
  neural db insert projects --row '{"name":"My new project"}'

${c.bold}Cron${c.reset}
  neural cron run github-sync
  neural gh sync                 (alias)

${c.bold}Zoho${c.reset}
  neural zoho mail --limit 10
  neural zoho leads
  neural zoho deals
  neural zoho send --to a@b.com --subject "..." --body "<p>hi</p>"

${c.bold}Perplexity${c.reset}
  neural pplx "what's new with Cloudflare Workers?" --deep --recency week

${c.bold}Cloudflare${c.reset}
  neural cf zones
  neural cf dns <zone_id>
  neural cf purge <zone_id>

${c.dim}Config: ~/.neural/config.json   ·   override URL: NEURAL_URL   ·   override token: NEURAL_TOKEN${c.reset}`;

export async function run(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") { log(HELP); return; }

  switch (cmd) {
    case "login":      return cmdLogin(rest);
    case "whoami":     return cmdWhoami();
    case "health":     return cmdHealth();
    case "tools":      return cmdTools(rest);
    case "ask":        return cmdAsk(rest);
    case "chat":       return cmdChat();
    case "db":         return cmdDb(rest);
    case "cron":       return cmdCron(rest);
    case "projects":   return cmdProjects();
    case "suggestions":return cmdSuggestions();
    case "zoho":       return cmdZoho(rest);
    case "gh":         return cmdGh(rest);
    case "pplx":       return cmdPplx(rest);
    case "cf":         return cmdCf(rest);
    default:
      throw new Error(`Unknown command: ${cmd}\nRun 'neural help' for the list.`);
  }
}

async function cmdLogin(args) {
  const { flags } = parseFlags(args);
  let { url, token } = flags;
  if (!url && !token) {
    info("Paste your CLI token (from /admin → CLI Tokens).");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    token = await new Promise((r) => rl.question("token (nrl_…): ", (a) => { rl.close(); r(a.trim()); }));
  }
  const patch = {};
  if (url) patch.url = url;
  if (token) patch.token = token;
  const cfg = saveConfig(patch);
  ok(`Saved to ~/.neural/config.json (url=${cfg.url})`);
  // Validate
  try {
    const me = await apiFetch(cfg, "GET", "whoami");
    ok(`Logged in as ${c.bold}${me.email ?? me.user_id}${c.reset}`);
  } catch (e) {
    warn(`Token saved but validation failed: ${e.message}`);
  }
}

async function cmdWhoami() {
  const cfg = requireToken();
  const me = await apiFetch(cfg, "GET", "whoami");
  printJSON(me);
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

async function cmdAsk(args) {
  const cfg = requireToken();
  const { flags, positional } = parseFlags(args);
  const prompt = positional.join(" ");
  if (!prompt) throw new Error("Usage: neural ask \"<prompt>\" [--agent slug] [--model model]");
  info("thinking…");
  const r = await apiFetch(cfg, "POST", "agent/run", {
    prompt,
    agent_slug: flags.agent,
    model: flags.model,
  });
  log("");
  log(c.bold + r.output + c.reset);
  log("");
  log(c.dim + `model=${r.model} provider=${r.provider} tools=${r.tool_calls?.length ?? 0} run=${r.run_id}` + c.reset);
  if (r.fallbacks?.length) {
    log(c.dim + "fallbacks: " + r.fallbacks.map((f) => `${f.provider}=${f.status}`).join(", ") + c.reset);
  }
  if (r.tool_calls?.length) {
    log(c.dim + "tool calls:" + c.reset);
    for (const t of r.tool_calls) log(c.dim + ` - ${t.name}(${JSON.stringify(t.args).slice(0, 60)}) ${t.ok ? "✓" : "✗ " + t.error}` + c.reset);
  }
}

async function cmdChat() {
  const cfg = requireToken();
  ok("neural chat — type your message, or /quit to exit, /agent <slug> to switch.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let agent_slug = "ceo-grok";
  const ask = () => rl.question(`${c.cyan}you›${c.reset} `, async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return ask();
    if (trimmed === "/quit" || trimmed === "/exit") { rl.close(); return; }
    if (trimmed.startsWith("/agent ")) { agent_slug = trimmed.slice(7).trim(); ok(`agent → ${agent_slug}`); return ask(); }
    try {
      const r = await apiFetch(cfg, "POST", "agent/run", { prompt: trimmed, agent_slug });
      log(`${c.magenta}brain›${c.reset} ${r.output}`);
      log(c.dim + `(${r.model} · ${r.provider} · ${r.tool_calls?.length ?? 0} tools)` + c.reset);
    } catch (e) {
      log(c.red + `error: ${e.message}` + c.reset);
    }
    ask();
  });
  ask();
}

async function cmdDb(args) {
  const cfg = requireToken();
  const sub = args[0];
  if (sub === "query") {
    const table = args[1];
    if (!table) throw new Error("Usage: neural db query <table> [--eq col=val] [--limit N] [--select cols]");
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

async function cmdCron(args) {
  const cfg = requireToken();
  if (args[0] !== "run" || !args[1]) throw new Error("Usage: neural cron run <job>");
  const r = await apiFetch(cfg, "POST", "cron/run", { job: args[1] });
  printJSON(r);
}

async function cmdProjects() {
  const cfg = requireToken();
  const { projects } = await apiFetch(cfg, "GET", "projects");
  printTable(projects.map((p) => ({
    name: p.name?.slice(0, 40),
    status: p.status,
    pri: p.priority,
    tags: (p.tags ?? []).slice(0, 2).join(","),
    last: p.last_worked_on?.slice(0, 10) ?? "",
  })), ["name", "status", "pri", "tags", "last"]);
  log(c.dim + `${projects.length} projects` + c.reset);
}

async function cmdSuggestions() {
  const cfg = requireToken();
  const { suggestions } = await apiFetch(cfg, "GET", "suggestions");
  for (const s of suggestions) {
    log(`${c.bold}${s.title}${c.reset}  ${c.dim}[${s.kind}]${c.reset}`);
    log(c.dim + s.body.slice(0, 240) + (s.body.length > 240 ? "…" : "") + c.reset);
    log("");
  }
  log(c.dim + `${suggestions.length} open suggestions` + c.reset);
}

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
  if (!query) throw new Error("Usage: neural pplx \"<query>\" [--deep] [--recency week]");
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
