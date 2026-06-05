// Prompt tester — deterministic. Reads approved prompts, fires each at every
// surface (1-shot), writes one JSONL row per (prompt x surface), prints a
// summary. In M0 the prompts are hand-written; from M1 they come from the
// prompt definer (same JSON shape).
//
//   node run-prompts.mjs northwind

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SURFACES } from "./lib/surfaces.mjs";
import { querySurface } from "./lib/openrouter.mjs";

const company = process.argv[2] ?? "northwind";
const root = dirname(fileURLToPath(import.meta.url));
const promptsPath = `${root}/companies/${company}/prompts.json`;
const outPath = `${root}/companies/${company}/raw_responses.jsonl`;

const prompts = JSON.parse(await readFile(promptsPath, "utf8"));
await mkdir(dirname(outPath), { recursive: true });

const rows = [];
for (const p of prompts) {
  for (const surface of SURFACES) {
    process.stdout.write(`-> [${p.track}] ${surface.label} ... `);
    try {
      const r = await querySurface(p.text, surface);
      rows.push({
        company,
        prompt_id: p.id,
        track: p.track,
        prompt: p.text,
        surface: surface.id,
        model: r.model,
        response: r.text,
        citations: r.citations,
        ts: new Date().toISOString(),
      });
      console.log(`ok - ${r.text.length} chars, ${r.citations.length} citations`);
    } catch (e) {
      console.log(`FAIL - ${e.message}`);
    }
  }
}

await writeFile(outPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`\nWrote ${rows.length} rows -> ${outPath}`);
