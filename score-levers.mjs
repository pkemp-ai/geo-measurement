// Back-compat shim. score-levers.mjs was split into two stages (framework v2.3+):
//   score-elements.mjs   — scores every rubric element -> levers.json
//   score-importance.mjs — importance matrix -> importance.json (+ merged into levers.json)
// This shim preserves the old entry points so existing docs/commands keep working:
//   node score-levers.mjs <slug>                  -> score-elements then score-importance
//   node score-levers.mjs <slug> --importance-only -> score-importance only
// New code should call the two stage scripts directly.

import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const slug = process.argv[2];
if (!slug) throw new Error("usage: node score-levers.mjs <slug> [--importance-only]");
const importanceOnly = process.argv.includes("--importance-only");

const run = (script) => {
  const r = spawnSync(process.execPath, [`${root}/${script}`, slug], { stdio: "inherit", env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (!importanceOnly) run("score-elements.mjs");
run("score-importance.mjs");
