#!/usr/bin/env node
import { run } from "../lib/cli.mjs";
run(process.argv.slice(2)).catch((e) => {
  console.error(`\x1b[31merror:\x1b[0m ${e?.message ?? e}`);
  process.exit(1);
});
