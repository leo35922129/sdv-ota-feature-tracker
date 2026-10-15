#!/usr/bin/env node
/**
 * Re-apply category rules to data/releases.json and write a change report.
 * Does NOT modify data/category-overrides.json or data/feature-edits.json —
 * manual overrides stay separate and continue to win at display time in app.js.
 * Features with manually set categories are skipped entirely (releases.json
 * automatic tags left untouched for those IDs).
 * Usage: node scripts/recategorize.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadManualCategoryProtections } from "./manual-category-protection.mjs";
import {
  TESLA_CATEGORY_ALIASES,
  canonicalTeslaCategoryName,
  normalizeTeslaCategories,
} from "./category-aliases.mjs";
import {
  featureIdentityKey,
  protectedIdentityKeys,
} from "./manual-category-lock.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "data", "releases.json");
const reportPath = join(root, "data", "recategorize-report.json");
const scrapeSrc = readFileSync(join(root, "scripts", "scrape.mjs"), "utf8");

const catsMatch = scrapeSrc.match(/const CATEGORIES = (\[[\s\S]*?\]);/);
const rulesMatch = scrapeSrc.match(/const CATEGORY_RULES = (\[[\s\S]*?\]);/);
const fnMatch = scrapeSrc.match(
  /function categorize\(title, description\) \{[\s\S]*?\n\}/
);
if (!catsMatch || !rulesMatch || !fnMatch) {
  throw new Error("Could not parse categorize helpers from scrape.mjs");
}

const CATEGORIES = eval(catsMatch[1]);
const CATEGORY_RULES = eval(rulesMatch[1]);
// eslint-disable-next-line no-new-func
const categorize = new Function(
  "CATEGORY_RULES",
  `${fnMatch[0]}; return categorize;`
)(CATEGORY_RULES);

const RENAME = TESLA_CATEGORY_ALIASES;

const protections = loadManualCategoryProtections();
let skippedManual = 0;

function normCats(cats) {
  return normalizeTeslaCategories(cats);
}

function featureKey(f, version) {
  return `${version || f.version || ""}||${f.id || f.title}`;
}

let data = JSON.parse(readFileSync(path, "utf8"));
const hasElectrek = (data.features || []).some((f) => f.source === "electrek");
if (!hasElectrek) {
  const { loadElectrekCache, mergeElectrekIntoReleases } = await import(
    "./scrape-electrek-tesla.mjs"
  );
  const electrek = loadElectrekCache();
  if (electrek) {
    data = mergeElectrekIntoReleases(electrek, data);
    try {
      const { enrichReleasesFile } = await import("./enrich-electrek-tesla.mjs");
      data = enrichReleasesFile(data);
    } catch {
      /* enrichment optional */
    }
    console.log(
      `Restored ${data.electrek?.addedFeatures || 0} Electrek historical features before recategorize`
    );
  }
}
const protectedKeys = protectedIdentityKeys(
  (data.releases || []).flatMap((r) => r.features || []),
  protections
);

const beforeCounts = {};
for (const f of data.features || []) {
  for (const c of normCats(f.categories)) {
    beforeCounts[c] = (beforeCounts[c] || 0) + 1;
  }
}

const moves = [];
const ambiguous = [];
const primaryChanged = [];

function applyFeature(f, version, release) {
  if (f?.source === "electrek" || release?.source === "electrek") {
    const oldCats = [...(f.categories || [])];
    const oldNorm = normCats(oldCats);
    if (JSON.stringify(oldCats) !== JSON.stringify(oldNorm)) {
      f.categories = oldNorm;
      f.primaryCategory = oldNorm[0] || f.primaryCategory;
    }
    return;
  }
  const identityLocked = protectedKeys.has(featureIdentityKey(f));
  if ((f?.id && protections.has(f.id)) || identityLocked) {
    skippedManual += 1;
    // Still normalize renamed legacy category names on protected rows
    const oldCats = [...(f.categories || [])];
    const oldNorm = normCats(oldCats);
    if (JSON.stringify(oldCats) !== JSON.stringify(oldNorm)) {
      f.categories = oldNorm;
      f.primaryCategory = oldNorm[0] || f.primaryCategory;
    }
    return;
  }

  const oldCats = [...(f.categories || [])];
  const oldPrimary = f.primaryCategory || oldCats[0] || null;
  const oldNorm = normCats(oldCats);
  const oldPrimaryNorm = canonicalTeslaCategoryName(oldPrimary);

  const next = categorize(f.title, f.description || "");
  f.categories = next;
  f.primaryCategory = next[0];

  const oldSet = new Set(oldNorm);
  const newSet = new Set(next);
  const removed = oldNorm.filter((c) => !newSet.has(c));
  const added = next.filter((c) => !oldSet.has(c));

  if (removed.length || added.length || oldPrimaryNorm !== next[0]) {
    const entry = {
      id: f.id,
      title: f.title,
      version: version || f.version,
      from: oldNorm,
      to: next,
      primaryFrom: oldPrimaryNorm,
      primaryTo: next[0],
    };
    moves.push(entry);
    if (oldPrimaryNorm !== next[0]) primaryChanged.push(entry);
  }

  // Flag weak / grab-bag / multi-domain titles for manual review
  if (
    /^(minor updates|minor fixes|other updates|additional improvements|additional features)$/i.test(
      f.title
    )
  ) {
    ambiguous.push({
      id: f.id,
      title: f.title,
      version: version || f.version,
      categories: next,
      reason: "grab-bag title",
    });
  } else if (next.length > 1) {
    ambiguous.push({
      id: f.id,
      title: f.title,
      version: version || f.version,
      categories: next,
      reason: "multi-category",
    });
  } else if (
    next[0] === "Vehicle OS" &&
    String(f.description || "").length > 120 &&
    !/firmware|mcu|wifi|wi-?fi|software|operating system|power management|vampire|sleep/i.test(
      `${f.title} ${f.description}`
    )
  ) {
    ambiguous.push({
      id: f.id,
      title: f.title,
      version: version || f.version,
      categories: next,
      reason: "fallback Vehicle OS",
    });
  }
}

for (const r of data.releases) {
  for (const f of r.features) {
    applyFeature(f, r.version, r);
  }
}

// Rebuild top-level features from releases, preserving electrek/source extras
const byKey = new Map(
  (data.features || []).map((f) => [featureKey(f, f.version), f])
);
data.features = data.releases.flatMap((r) =>
  r.features.map((f) => {
    const prev = byKey.get(featureKey(f, r.version));
    return {
      ...(prev || {}),
      ...f,
      version: r.version,
      releaseDate: r.releaseDate,
      releaseUrl: r.url || prev?.releaseUrl,
      source: f.source || r.source || prev?.source,
    };
  })
);

data.categories = CATEGORIES;
const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
for (const f of data.features) {
  for (const c of f.categories) {
    if (categoryCounts[c] != null) categoryCounts[c]++;
  }
}
data.categoryCounts = categoryCounts;
data.featureCount = data.features.length;
data.releaseCount = data.releases.length;
data.recategorizedAt = new Date().toISOString();

writeFileSync(path, JSON.stringify(data, null, 2));

const afterCounts = categoryCounts;
const allCatNames = [
  ...new Set([...Object.keys(beforeCounts), ...CATEGORIES]),
].sort();

const report = {
  recategorizedAt: data.recategorizedAt,
  featureCount: data.featureCount,
  renames: RENAME,
  addedCategories: [
    "Display",
    "Performance",
    "Phone Call",
    "Security",
    "Audio",
  ],
  beforeCounts,
  afterCounts,
  countDelta: Object.fromEntries(
    allCatNames.map((c) => [
      c,
      (afterCounts[c] || 0) - (beforeCounts[c] || 0),
    ])
  ),
  primaryChangedCount: primaryChanged.length,
  movesCount: moves.length,
  // Cap move list in report file; full primary changes kept
  primaryChanges: primaryChanged.map((m) => ({
    title: m.title,
    version: m.version,
    from: m.primaryFrom,
    to: m.primaryTo,
  })),
  ambiguous: (() => {
    const uniq = new Map();
    for (const a of ambiguous) {
      const k = `${a.title}||${a.reason}`;
      if (!uniq.has(k)) uniq.set(k, a);
    }
    return [...uniq.values()].slice(0, 150);
  })(),
  ambiguousCount: ambiguous.length,
  ambiguousUniqueCount: new Set(ambiguous.map((a) => a.title)).size,
  skippedManualOverrideCount: skippedManual,
  protectedIdCount: protections.size,
};

writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log("Recategorized", data.featureCount, "features");
console.log("Skipped manual overrides (feature instances):", skippedManual);
console.log("Primary category changes:", primaryChanged.length);
console.log("Ambiguous:", ambiguous.length);
console.log("Wrote", reportPath);
console.log("\nBefore → After (raw feature-tag counts):");
for (const c of CATEGORIES) {
  const b = beforeCounts[c] || 0;
  const a = afterCounts[c] || 0;
  if (b || a) console.log(`  ${c}: ${b} → ${a}`);
}
for (const c of Object.keys(beforeCounts).sort()) {
  if (!CATEGORIES.includes(c)) {
    console.log(`  ${c}: ${beforeCounts[c]} → 0 (renamed/removed)`);
  }
}
