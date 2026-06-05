// Prose linter — deterministic, key-free, no deps. Flags AI-writing tells in
// report/deck copy. HARD-FAILS (exit 1) on em dashes; everything else is a WARN.
//
//   node prose-lint.mjs companies/northwind/outline.md [more files...]
//   echo "some text" | node prose-lint.mjs        # reads stdin if no files
//
// Intentionally tiny + high-precision: a short, trusted list beats a noisy one.
// The em dash is the only hard fail because it is the loudest tell and never
// truly needed (split the sentence, or use a comma). Mechanical tics belong in a
// script like this, NOT an LLM cleanup pass — a regex can't lose context or
// over-correct. Register/voice is handled by the writer at draft time, not here.

import { readFile } from "node:fs/promises";

const FAIL = "FAIL", WARN = "WARN";

// id · severity · global regex · short fix hint
const RULES = [
  { id: "em-dash",        sev: FAIL, re: /—/g,        hint: "em dash: split into two sentences, or a comma if truly parenthetical" },
  { id: "em-dash-ascii",  sev: WARN, re: / -- /g,          hint: "spaced double hyphen reads as an em dash" },
  { id: "en-dash-spaced", sev: WARN, re: / – /g,      hint: "spaced en dash reads as an em dash (unspaced is fine for ranges)" },
  { id: "semicolon",      sev: WARN, re: /;/g,             hint: "semicolons often glue two thoughts an AI would; prefer a period" },
  { id: "not-just",       sev: WARN, re: /\bnot (?:just|only)\b.{0,60}?\b(?:but|it'?s|they'?re|we'?re|that'?s)\b/gi, hint: '"not just X, it\'s Y" construction' },
  { id: "hype",           sev: WARN, re: /\b(?:robust|seamless(?:ly)?|unlock|delve|tapestry|realm|testament|elevate|harness|boasts?|plethora|myriad|underscore[sd]?|pivotal|game[- ]?changer|cutting[- ]edge|ever[- ]evolving|supercharge|turbocharge|treasure trove)\b/gi, hint: "AI-vocabulary hype word" },
  { id: "leverage-verb",  sev: WARN, re: /(?<!-)\bleverag(?:e|ed|es|ing)\b/gi, hint: 'the "leverage" verb tell (try "use"); a hyphenated "highest-leverage" is fine' },
  { id: "in-todays",      sev: WARN, re: /\bin today'?s\b/gi, hint: '"in today\'s ..." opener' },
];

async function getInput() {
  const files = process.argv.slice(2);
  if (files.length) {
    return Promise.all(files.map(async (f) => ({ file: f, text: await readFile(f, "utf8") })));
  }
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return [{ file: "<stdin>", text: Buffer.concat(chunks).toString("utf8") }];
}

const all = await getInput();
const skipped = all.filter((i) => /\.html?$/i.test(i.file));
const inputs = all.filter((i) => !/\.html?$/i.test(i.file));
if (skipped.length) console.log(`skipped (HTML is page chrome, not deck prose; grep for em dashes there): ${skipped.map((s) => s.file).join(", ")}`);
let fails = 0, warns = 0;

for (const { file, text } of inputs) {
  text.split("\n").forEach((line, i) => {
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line))) {
        const mark = rule.sev === FAIL ? "x" : "-";
        console.log(`${mark} ${rule.sev} ${file}:${i + 1}:${m.index + 1}  [${rule.id}] "${m[0].trim() || m[0]}" — ${rule.hint}`);
        console.log(`    ${line.trim().slice(0, 100)}`);
        rule.sev === FAIL ? fails++ : warns++;
        if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
      }
    }
  });
}

console.log(`\n${fails} fail(s), ${warns} warning(s) across ${inputs.length} file(s).`);
process.exit(fails > 0 ? 1 : 0);
