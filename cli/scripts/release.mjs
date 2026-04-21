#!/usr/bin/env node
/**
 * One-command release helper.
 * Usage:
 *   node ./scripts/release.mjs patch        → bump patch, commit-tag-publish
 *   node ./scripts/release.mjs minor
 *   node ./scripts/release.mjs major
 *   node ./scripts/release.mjs <x.y.z>      → set explicit version
 *
 * Run from cli/ directory. Requires `npm login` already done.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const arg = process.argv[2];
if (!arg) { console.error("usage: release.mjs <patch|minor|major|x.y.z>"); process.exit(1); }

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
const [maj, min, pat] = pkg.version.split(".").map(Number);
let next;
if (arg === "patch") next = `${maj}.${min}.${pat + 1}`;
else if (arg === "minor") next = `${maj}.${min + 1}.0`;
else if (arg === "major") next = `${maj + 1}.0.0`;
else if (/^\d+\.\d+\.\d+/.test(arg)) next = arg;
else { console.error("invalid version"); process.exit(1); }

pkg.version = next;
writeFileSync("./package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log(`→ bumped to ${next}`);

execSync("npm publish --access public", { stdio: "inherit" });
console.log(`✓ published @profireaper/neural-cli@${next}`);
