#!/usr/bin/env node
/**
 * Name-only Tesla tag normalization.
 * Rewrites legacy labels (FSD, Driver Profile, Charging, Map / Navigation / Trip)
 * to canonical category names. Does not recategorize or change protected assignments.
 *
 * Usage: node scripts/normalize-tag-names.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TESLA_CATEGORY_ALIASES,
  normalizeTeslaFeatureTags,
  teslaCategoriesChanged,
} from "./category-aliases.mjs";
import { loadManualCategoryProtections } from "./manual-category-protection.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASES = join(root, "data", "releases.json");
const ELECTREK = join(root, "data", "electrek-tesla-features.json");

function rebuildCounts(features, canonical) {
  const counts = Object.fromEntries((canonical || []).map((c) => [c, 0]));
  for (const f of features || []) {
    for (const c of f.categories || []) {
      if (counts[c] == null) counts[c] = 0;
      counts[c] += 1;
    }
  }
  return counts;
}

function normalizeCollection(features, protections, stats) {
  return (features || []).map((f) => {
    const before = [...(f.categories || [])];
    const next = normalizeTeslaFeatureTags(f);
    if (!teslaCategoriesChanged(before, next.categories)) return next;
    stats.featuresUpdated += 1;
    if (f.id && protections.has(f.id)) {
      stats.protectedNameOnly += 1;
      stats.protectedIds.add(f.id);
      const title = next.title || f.title;
      if (title) stats.protectedTitles.add(title);
    }
    for (const c of before) {
      const mapped = TESLA_CATEGORY_ALIASES[c];
      if (mapped && mapped !== c) {
        stats.renames[c] = (stats.renames[c] || 0) + 1;
      }
    }
    return next;
  });
}

function normalizeDoc(path, { nestedOnly = false } = {}) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  const protections = loadManualCategoryProtections();
  const stats = {
    featuresUpdated: 0,
    protectedNameOnly: 0,
    protectedIds: new Set(),
    protectedTitles: new Set(),
    renames: {},
  };

  if (Array.isArray(data.releases)) {
    for (const release of data.releases) {
      release.features = normalizeCollection(
        release.features,
        protections,
        stats
      );
    }
  }

  if (!nestedOnly && Array.isArray(data.features)) {
    const nestedStats = {
      featuresUpdated: 0,
      protectedNameOnly: 0,
      protectedIds: new Set(),
      protectedTitles: new Set(),
      renames: {},
    };
    data.features = normalizeCollection(
      data.features,
      protections,
      nestedStats
    );
    stats.topLevelUpdated = nestedStats.featuresUpdated;
    stats.topLevelProtected = nestedStats.protectedIds.size;
  }

  if (Array.isArray(data.categories) && Array.isArray(data.features)) {
    data.categoryCounts = rebuildCounts(data.features, data.categories);
  }

  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  return {
    path,
    featuresUpdated: stats.featuresUpdated,
    topLevelUpdated: stats.topLevelUpdated || 0,
    protectedNameOnlyIds: [...stats.protectedIds].sort(),
    protectedTitles: [...stats.protectedTitles].sort(),
    renames: stats.renames,
    categoryCounts: data.categoryCounts || null,
  };
}

const tesla = normalizeDoc(RELEASES);
const electrek = normalizeDoc(ELECTREK);

console.log("Tesla tag-name normalization (no category reassignment)");
console.log("Aliases:", TESLA_CATEGORY_ALIASES);
console.log("releases.json nested features updated:", tesla.featuresUpdated);
console.log("releases.json top-level features updated:", tesla.topLevelUpdated);
console.log("electrek nested features updated:", electrek.featuresUpdated);
console.log("Protected IDs with name-only automatic-tag updates:", tesla.protectedNameOnlyIds.length);
console.log("Protected feature titles left in their manual categories:");
for (const title of tesla.protectedTitles) console.log(`  - ${title}`);
console.log("Rename occurrence counts (nested):", tesla.renames);
console.log("Updated Tesla categoryCounts:", tesla.categoryCounts);
