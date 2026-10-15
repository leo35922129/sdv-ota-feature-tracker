#!/usr/bin/env node
/**
 * Re-apply Rivian category rules to data/rivian-releases.json.
 * Skips features with manually set categories in feature-edits.json.
 * Usage: node scripts/recategorize-rivian.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RIVIAN_CATEGORIES,
  categorizeRivian,
} from "./rivian-categories.mjs";
import { loadManualCategoryProtections } from "./manual-category-protection.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "data", "rivian-releases.json");
const data = JSON.parse(readFileSync(path, "utf8"));
const protections = loadManualCategoryProtections();

let skippedManual = 0;
let changed = 0;

function applyFeature(f) {
  if (f?.id && protections.has(f.id)) {
    skippedManual += 1;
    return;
  }
  const next = categorizeRivian(f.title, f.description || "");
  const prev = [...(f.categories || [])];
  if (JSON.stringify(prev) !== JSON.stringify(next)) changed += 1;
  f.categories = next;
  f.primaryCategory = next[0];
}

for (const r of data.releases || []) {
  for (const f of r.features || []) applyFeature(f);
}
for (const f of data.features || []) applyFeature(f);

const categoryCounts = Object.fromEntries(RIVIAN_CATEGORIES.map((c) => [c, 0]));
for (const f of data.features || []) {
  for (const c of f.categories || []) {
    if (categoryCounts[c] != null) categoryCounts[c] += 1;
  }
}

data.categories = RIVIAN_CATEGORIES;
data.categoryCounts = categoryCounts;
data.recategorizedAt = new Date().toISOString();

writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
console.log("Rivian recategorize complete");
console.log("Features updated:", changed);
console.log("Skipped manual overrides:", skippedManual);
console.log("Drive Assist & Autonomy count:", categoryCounts["Drive Assist & Autonomy"]);
console.log("Audio count:", categoryCounts.Audio);
console.log("Connectivity count:", categoryCounts.Connectivity);
