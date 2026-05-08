#!/usr/bin/env node
/**
 * Tiny test runner — no new dependency, no jest/vitest install.
 *
 * Discovers every *.test.mjs under test/ and runs them. Each test file
 * exports an array of `{name, run}` cases. The runner reports pass/fail
 * with a non-zero exit code on any failure so CI / `npm test` works.
 *
 * Why custom: at <10 users we don't need a watch-mode + plugin ecosystem.
 * The dependencies we already have (next, supabase-js, anthropic-sdk) take
 * ~2 minutes to npm install on a clean machine. Adding jest/vitest would
 * roughly double that with no immediate payoff. When we cross 50 users
 * and start writing more tests, swap in vitest — the case shape here
 * matches `test()`/`describe()` so migration is a sed.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

async function discover(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...(await discover(join(dir, entry.name))));
    } else if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

const files = await discover(here);
let passed = 0;
let failed = 0;
const failures = [];

for (const file of files) {
  const mod = await import(pathToFileURL(file).href);
  const cases = mod.default ?? mod.cases ?? [];
  if (!Array.isArray(cases)) {
    console.error(`✗ ${file}: default export must be an array of test cases`);
    failed++;
    continue;
  }
  for (const c of cases) {
    process.stdout.write(`  ${c.name} ... `);
    try {
      await c.run();
      console.log("ok");
      passed++;
    } catch (err) {
      console.log("FAIL");
      failed++;
      failures.push({ name: c.name, file, err });
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`\n  ${f.name}  (${f.file})`);
    const msg =
      f.err instanceof Error
        ? `${f.err.message}\n${f.err.stack ?? ""}`
        : String(f.err);
    console.log(msg.split("\n").map((l) => "    " + l).join("\n"));
  }
}
process.exit(failed === 0 ? 0 : 1);
