/**
 * Persistent CLI config stored at ~/.neural/config.json
 * Holds: { url, token, defaultAgent, defaultModel }
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".neural");
const FILE = join(DIR, "config.json");
const DEFAULT_URL = process.env.NEURAL_URL || "https://neural-guide-sync.lovable.app";

export function loadConfig() {
  if (!existsSync(FILE)) return { url: DEFAULT_URL };
  try {
    const raw = readFileSync(FILE, "utf8");
    const cfg = JSON.parse(raw);
    return { url: DEFAULT_URL, ...cfg };
  } catch {
    return { url: DEFAULT_URL };
  }
}

export function saveConfig(patch) {
  const current = loadConfig();
  const next = { ...current, ...patch };
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

export function requireToken() {
  const cfg = loadConfig();
  const token = process.env.NEURAL_TOKEN || cfg.token;
  if (!token) {
    throw new Error("Not logged in. Run `neural login` (or set NEURAL_TOKEN).");
  }
  return { ...cfg, token };
}
