/**
 * GET /api/public/bridge-daemon — serves the merkabah-bridge Mac daemon
 * as a single-file, dependency-free Node.js script. The user runs:
 *
 *   curl -sSL https://<host>/api/public/bridge-daemon -o merkabah-bridge.mjs
 *   node merkabah-bridge.mjs pair <CODE>
 *   node merkabah-bridge.mjs serve
 *
 * The daemon does NOT open any inbound port. It only makes HTTPS calls out to
 * the cloud. All filesystem work happens locally and is sandboxed to the
 * `allowed_roots` returned by the cloud during heartbeat.
 */
import { createFileRoute } from "@tanstack/react-router";

const DAEMON_SOURCE = String.raw`#!/usr/bin/env node
/**
 * merkabah-bridge — Sovereign bridge daemon.
 * Author: Merkabah OS · License: MIT · Zero npm dependencies.
 *
 * Commands:
 *   merkabah-bridge pair <8-CHAR-CODE>     One-time pairing. Stores key in ~/.merkabah/bridge.json (0600).
 *   merkabah-bridge serve                  Long-running heartbeat + offline queue flush.
 *   merkabah-bridge status                 Print current pairing + last heartbeat.
 *   merkabah-bridge ls <path>              List directory (sandboxed).
 *   merkabah-bridge cat <path>             Read file (sandboxed).
 *   merkabah-bridge revoke                 Forget local credentials.
 *
 * Sandboxing:
 *   Every fs operation is resolved to an absolute path and must start with
 *   one of the allowed_roots returned by the cloud. ~ is expanded.
 *
 * Offline queue:
 *   When the cloud is unreachable, audit events are written to
 *   ~/.merkabah/queue.jsonl and flushed on the next successful heartbeat.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { URL } from "node:url";

const HOST = process.env.MERKABAH_HOST || "https://neural-guide-sync.lovable.app";
const HOME = os.homedir();
const DIR = path.join(HOME, ".merkabah");
const CFG = path.join(DIR, "bridge.json");
const QUEUE = path.join(DIR, "queue.jsonl");

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
}
function loadCfg() {
  if (!fs.existsSync(CFG)) return null;
  try { return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch { return null; }
}
function saveCfg(cfg) {
  ensureDir();
  fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, HOST);
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const headers = { "Content-Type": "application/json" };
    if (data) headers["Content-Length"] = data.length;
    if (token) headers["Authorization"] = "Bearer " + token;
    const req = https.request(
      { method, hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, headers, timeout: 15000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
          resolve({ status: res.statusCode || 0, body: json });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (data) req.write(data);
    req.end();
  });
}

function expand(p) {
  if (p.startsWith("~")) return path.join(HOME, p.slice(1));
  return path.resolve(p);
}
function withinAllowedRoots(p, roots) {
  const abs = expand(p);
  return roots.some((r) => {
    const ar = expand(r);
    return abs === ar || abs.startsWith(ar + path.sep);
  });
}

function enqueue(event) {
  ensureDir();
  fs.appendFileSync(QUEUE, JSON.stringify(event) + "\n", { mode: 0o600 });
}
async function flushQueue(token) {
  if (!fs.existsSync(QUEUE)) return 0;
  const lines = fs.readFileSync(QUEUE, "utf8").split("\n").filter(Boolean);
  if (!lines.length) return 0;
  let sent = 0;
  for (const line of lines) {
    try {
      const ev = JSON.parse(line);
      const r = await request("POST", "/api/public/bridge/event", ev, token);
      if (r.status >= 200 && r.status < 300) sent++; else break;
    } catch { break; }
  }
  // Drop the sent ones
  const remaining = lines.slice(sent);
  if (remaining.length) fs.writeFileSync(QUEUE, remaining.join("\n") + "\n", { mode: 0o600 });
  else fs.rmSync(QUEUE);
  return sent;
}

async function logEvent(token, action, target, ok, error, bytes, durationMs) {
  const ev = { action, target, ok, error, bytes, duration_ms: durationMs };
  try {
    const r = await request("POST", "/api/public/bridge/event", ev, token);
    if (r.status >= 200 && r.status < 300) return;
    enqueue(ev);
  } catch {
    enqueue(ev);
  }
}

async function cmdPair(code) {
  if (!code || !/^[A-Z0-9]{8}$/i.test(code)) {
    console.error("Usage: merkabah-bridge pair <8-CHAR-CODE>");
    process.exit(1);
  }
  const r = await request("POST", "/api/public/bridge/pair", { code: code.toUpperCase(), hostname: os.hostname() });
  if (r.status !== 200 || !r.body?.ok) {
    console.error("Pairing failed:", r.body?.error || r.status);
    process.exit(1);
  }
  saveCfg({ api_key: r.body.api_key, device_id: r.body.device_id, host: HOST, paired_at: new Date().toISOString() });
  console.log("✓ Paired. Device id:", r.body.device_id);
  console.log("  Credentials stored at:", CFG, "(mode 0600)");
  console.log("  Run: merkabah-bridge serve");
}

async function cmdServe() {
  const cfg = loadCfg();
  if (!cfg?.api_key) { console.error("Not paired. Run: merkabah-bridge pair <code>"); process.exit(1); }
  console.log("merkabah-bridge serving for device", cfg.device_id);
  console.log("Heartbeat every 30s. Offline events queue to", QUEUE);
  let allowed = [];
  let caps = [];
  const beat = async () => {
    try {
      const r = await request("POST", "/api/public/bridge/heartbeat", { hostname: os.hostname() }, cfg.api_key);
      if (r.status === 200 && r.body?.ok) {
        allowed = r.body.allowed_roots || [];
        caps = r.body.capabilities || [];
        const flushed = await flushQueue(cfg.api_key);
        process.stdout.write("." + (flushed ? " (flushed " + flushed + ")\n" : ""));
      } else if (r.status === 401) {
        console.error("\n✗ Auth rejected. Re-pair with: merkabah-bridge pair <code>");
        process.exit(1);
      } else {
        process.stdout.write("?");
      }
    } catch {
      process.stdout.write("x"); // offline
    }
  };
  await beat();
  setInterval(beat, 30_000);
}

async function cmdLs(p) {
  const cfg = loadCfg();
  if (!cfg) { console.error("Not paired."); process.exit(1); }
  const r = await request("POST", "/api/public/bridge/heartbeat", {}, cfg.api_key);
  const allowed = r.body?.allowed_roots || ["~"];
  if (!withinAllowedRoots(p, allowed)) {
    console.error("✗ Path outside allowed_roots:", allowed.join(", "));
    await logEvent(cfg.api_key, "fs.list", p, false, "outside-sandbox", null, 0);
    process.exit(1);
  }
  const t0 = Date.now();
  try {
    const entries = fs.readdirSync(expand(p), { withFileTypes: true });
    for (const e of entries) console.log((e.isDirectory() ? "d " : "- ") + e.name);
    await logEvent(cfg.api_key, "fs.list", p, true, null, entries.length, Date.now() - t0);
  } catch (e) {
    console.error("✗", e.message);
    await logEvent(cfg.api_key, "fs.list", p, false, e.message, null, Date.now() - t0);
  }
}

async function cmdCat(p) {
  const cfg = loadCfg();
  if (!cfg) { console.error("Not paired."); process.exit(1); }
  const r = await request("POST", "/api/public/bridge/heartbeat", {}, cfg.api_key);
  const allowed = r.body?.allowed_roots || ["~"];
  if (!withinAllowedRoots(p, allowed)) {
    console.error("✗ Path outside allowed_roots:", allowed.join(", "));
    process.exit(1);
  }
  const t0 = Date.now();
  try {
    const buf = fs.readFileSync(expand(p));
    process.stdout.write(buf);
    await logEvent(cfg.api_key, "fs.read", p, true, null, buf.length, Date.now() - t0);
  } catch (e) {
    console.error("✗", e.message);
    await logEvent(cfg.api_key, "fs.read", p, false, e.message, null, Date.now() - t0);
  }
}

function cmdStatus() {
  const cfg = loadCfg();
  if (!cfg) { console.log("Not paired."); return; }
  console.log("Host:        ", cfg.host);
  console.log("Device id:   ", cfg.device_id);
  console.log("Paired at:   ", cfg.paired_at);
  if (fs.existsSync(QUEUE)) {
    const n = fs.readFileSync(QUEUE, "utf8").split("\n").filter(Boolean).length;
    console.log("Queued evts: ", n, "(will flush on next heartbeat)");
  } else {
    console.log("Queued evts:  0");
  }
}

function cmdRevoke() {
  if (fs.existsSync(CFG)) fs.rmSync(CFG);
  if (fs.existsSync(QUEUE)) fs.rmSync(QUEUE);
  console.log("✓ Local credentials and queue cleared.");
}

const [,, cmd, ...args] = process.argv;
switch (cmd) {
  case "pair":   cmdPair(args[0]); break;
  case "serve":  cmdServe(); break;
  case "status": cmdStatus(); break;
  case "ls":     cmdLs(args[0] || "~"); break;
  case "cat":    cmdCat(args[0]); break;
  case "revoke": cmdRevoke(); break;
  default:
    console.log("merkabah-bridge — Sovereign Mac bridge for Merkabah OS\n");
    console.log("  pair <CODE>   One-time pairing using the 8-char code from the PWA");
    console.log("  serve         Run the heartbeat loop (Ctrl-C to stop)");
    console.log("  status        Show pairing + queued events");
    console.log("  ls <path>     List a directory (sandboxed to allowed_roots)");
    console.log("  cat <path>    Read a file (sandboxed)");
    console.log("  revoke        Clear local credentials");
}
`;

export const Route = createFileRoute("/api/public/bridge-daemon")({
  server: {
    handlers: {
      GET: async () =>
        new Response(DAEMON_SOURCE, {
          status: 200,
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Content-Disposition": 'attachment; filename="merkabah-bridge.mjs"',
            "Cache-Control": "public, max-age=60",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
