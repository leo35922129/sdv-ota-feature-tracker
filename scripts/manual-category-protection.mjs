#!/usr/bin/env node
/**
 * Detect and persist manual category overrides so automatic recategorization
 * never overwrites user-chosen tags.
 *
 * Protected sources (authoritative display overlays):
 *  1. data/feature-edits.json — entries with a `categories` array
 *  2. data/category-overrides.json — entries with a `categories` array
 *
 * Display priority remains: feature-edits → category-overrides → automatic
 * (releases.json). Automatic scripts must skip protected IDs when mutating
 * releases.json categories.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "..");
export const EDITS_PATH = join(ROOT, "data", "feature-edits.json");
export const OVERRIDES_PATH = join(ROOT, "data", "category-overrides.json");

export const CATEGORY_SOURCE_AUTOMATIC = "automatic";
export const CATEGORY_SOURCE_MANUAL = "manual_override";
export const CATEGORY_SOURCE_OVERRIDE_FILE = "category_override";

function loadJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * @returns {Map<string, { source: string, categories: string[], note?: string, updatedAt?: string }>}
 */
export function loadManualCategoryProtections({
  editsPath = EDITS_PATH,
  overridesPath = OVERRIDES_PATH,
} = {}) {
  const map = new Map();

  const overrideDoc = loadJson(overridesPath, { overrides: [] });
  for (const entry of overrideDoc?.overrides || []) {
    if (!entry?.id || !Array.isArray(entry.categories) || !entry.categories.length) {
      continue;
    }
    map.set(entry.id, {
      source: CATEGORY_SOURCE_OVERRIDE_FILE,
      categories: [...entry.categories],
      note: entry.note || null,
      updatedAt: entry.updatedAt || null,
    });
  }

  const editsDoc = loadJson(editsPath, { edits: [] });
  for (const entry of editsDoc?.edits || []) {
    if (!entry?.id || !Array.isArray(entry.categories) || !entry.categories.length) {
      continue;
    }
    // feature-edits win over category-overrides for the same id
    map.set(entry.id, {
      source: entry.categorySource || CATEGORY_SOURCE_MANUAL,
      categories: [...entry.categories],
      note: entry.note || null,
      updatedAt: entry.updatedAt || null,
    });
  }

  return map;
}

export function isCategoryManuallyProtected(id, protections = null) {
  const map = protections || loadManualCategoryProtections();
  return map.has(id);
}

export function getProtection(id, protections = null) {
  const map = protections || loadManualCategoryProtections();
  return map.get(id) || null;
}
