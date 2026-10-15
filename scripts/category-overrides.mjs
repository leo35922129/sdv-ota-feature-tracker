#!/usr/bin/env node
/**
 * Manual Tesla category overrides (ID-keyed), kept separate from scrape/recategorize data.
 *
 * Usage:
 *   node scripts/category-overrides.mjs validate
 *   node scripts/category-overrides.mjs dry-run
 *   node scripts/category-overrides.mjs dry-run --id new-ambient-lighting-options-2024-26-1-detail
 *   node scripts/category-overrides.mjs lookup "New Ambient Lighting Options"
 *   node scripts/category-overrides.mjs add --id <feature-id> --categories Lighting [--note "..."] [--dry-run]
 *
 * Display priority (app.js): override categories > automatic categories in releases.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RELEASES = join(ROOT, "data", "releases.json");
const OVERRIDES = join(ROOT, "data", "category-overrides.json");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadCanonicalCategories(releases) {
  const cats = releases.categories;
  if (!Array.isArray(cats) || !cats.length) {
    throw new Error("releases.json is missing a non-empty categories[] list");
  }
  return cats;
}

function loadOverridesFile() {
  if (!existsSync(OVERRIDES)) {
    return { version: 1, overrides: [] };
  }
  return loadJson(OVERRIDES);
}

function indexFeatures(releases) {
  const byId = new Map();
  const byTitle = new Map();
  for (const f of releases.features || []) {
    const id = f.id;
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(f);
    const title = String(f.title || "");
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push(f);
  }
  return { byId, byTitle };
}

/**
 * Validate override file against releases. Does not mutate releases.json.
 */
export function validateOverrides(releases, overrideDoc) {
  const canonical = loadCanonicalCategories(releases);
  const canonicalSet = new Set(canonical);
  const { byId, byTitle } = indexFeatures(releases);
  const overrides = overrideDoc.overrides || [];

  const issues = {
    missingIds: [],
    invalidCategories: [],
    duplicateOverrides: [],
    emptyCategories: [],
    malformedEntries: [],
    titleCollisions: [],
  };

  const seenOverrideIds = new Map();

  for (const [i, entry] of overrides.entries()) {
    if (!entry || typeof entry !== "object") {
      issues.malformedEntries.push({ index: i, reason: "entry is not an object" });
      continue;
    }
    const id = entry.id;
    if (!id || typeof id !== "string") {
      issues.malformedEntries.push({ index: i, reason: "missing string id", entry });
      continue;
    }
    if (seenOverrideIds.has(id)) {
      issues.duplicateOverrides.push({
        id,
        firstIndex: seenOverrideIds.get(id),
        duplicateIndex: i,
      });
    } else {
      seenOverrideIds.set(id, i);
    }

    if (!byId.has(id)) {
      issues.missingIds.push({ id, index: i });
    }

    const cats = entry.categories;
    if (!Array.isArray(cats) || cats.length === 0) {
      issues.emptyCategories.push({ id, index: i });
    } else {
      for (const c of cats) {
        if (!canonicalSet.has(c)) {
          issues.invalidCategories.push({
            id,
            index: i,
            category: c,
            hint: "Must match canonical list exactly — no silent renaming",
          });
        }
      }
    }

    const rows = byId.get(id) || [];
    if (rows.length) {
      const title = rows[0].title;
      const titleRows = byTitle.get(title) || [];
      const distinctIds = [...new Set(titleRows.map((r) => r.id))];
      if (distinctIds.length > 1) {
        // Report once per override id (caller can dedupe)
        issues.titleCollisions.push({
          id,
          title,
          matchingIds: distinctIds,
          matchingVersions: [
            ...new Set(titleRows.map((r) => r.version).filter(Boolean)),
          ],
        });
      }
    }
  }

  // Dedupe title collisions by title
  const titleSeen = new Set();
  issues.titleCollisions = issues.titleCollisions.filter((t) => {
    if (titleSeen.has(t.title)) return false;
    titleSeen.add(t.title);
    return true;
  });

  const errorCount =
    issues.missingIds.length +
    issues.invalidCategories.length +
    issues.duplicateOverrides.length +
    issues.emptyCategories.length +
    issues.malformedEntries.length;

  return {
    ok: errorCount === 0,
    errorCount,
    warningCount: issues.titleCollisions.length,
    canonicalCategories: canonical,
    overrideCount: overrides.length,
    issues,
  };
}

export function overrideMap(overrideDoc) {
  const map = new Map();
  for (const entry of overrideDoc.overrides || []) {
    if (!entry?.id || !Array.isArray(entry.categories) || !entry.categories.length) {
      continue;
    }
    map.set(entry.id, entry);
  }
  return map;
}

/**
 * Apply overrides in memory only. Original releases.json categories stay as automatic.
 */
export function applyOverridesInMemory(features, overrideDoc) {
  const map = overrideMap(overrideDoc);
  return (features || []).map((f) => {
    const autoCategories = [...(f.categories || [])];
    const autoPrimary = f.primaryCategory || autoCategories[0] || null;
    const entry = map.get(f.id);
    if (!entry) {
      return {
        ...f,
        categoriesAuto: autoCategories,
        primaryCategoryAuto: autoPrimary,
        categorySource: "automatic",
      };
    }
    return {
      ...f,
      categoriesAuto: autoCategories,
      primaryCategoryAuto: autoPrimary,
      categories: [...entry.categories],
      primaryCategory: entry.categories[0],
      categorySource: "override",
      categoryOverrideNote: entry.note || null,
    };
  });
}

export function previewChanges(releases, overrideDoc, { idFilter = null } = {}) {
  const map = overrideMap(overrideDoc);
  const changes = [];
  for (const f of releases.features || []) {
    if (idFilter && f.id !== idFilter) continue;
    const entry = map.get(f.id);
    if (!entry) continue;
    const before = [...(f.categories || [])];
    const after = [...entry.categories];
    const same =
      before.length === after.length && before.every((c, i) => c === after[i]);
    changes.push({
      id: f.id,
      title: f.title,
      version: f.version,
      before,
      after,
      primaryBefore: f.primaryCategory || before[0] || null,
      primaryAfter: after[0] || null,
      unchanged: same,
      note: entry.note || null,
    });
  }
  return changes;
}

export function lookupByTitle(releases, titleQuery) {
  const q = String(titleQuery || "").trim().toLowerCase();
  const hits = (releases.features || []).filter(
    (f) => String(f.title || "").toLowerCase() === q
  );
  const byId = new Map();
  for (const f of hits) {
    if (!byId.has(f.id)) byId.set(f.id, []);
    byId.get(f.id).push(f);
  }
  return [...byId.entries()].map(([id, rows]) => ({
    id,
    title: rows[0].title,
    versions: rows.map((r) => r.version),
    categories: rows[0].categories,
    primaryCategory: rows[0].primaryCategory,
  }));
}

function saveOverrides(doc) {
  writeFileSync(OVERRIDES, JSON.stringify(doc, null, 2) + "\n");
}

function printValidation(result) {
  console.log(
    result.ok
      ? `Validation OK — ${result.overrideCount} override(s)`
      : `Validation FAILED — ${result.errorCount} error(s), ${result.warningCount} warning(s)`
  );
  const { issues } = result;
  if (issues.malformedEntries.length) {
    console.log("\nMalformed entries:");
    issues.malformedEntries.forEach((x) => console.log(" ", x));
  }
  if (issues.missingIds.length) {
    console.log("\nMissing feature IDs:");
    issues.missingIds.forEach((x) => console.log(`  ${x.id}`));
  }
  if (issues.invalidCategories.length) {
    console.log("\nInvalid categories (must match canonical list exactly):");
    issues.invalidCategories.forEach((x) =>
      console.log(`  ${x.id}: "${x.category}"`)
    );
  }
  if (issues.duplicateOverrides.length) {
    console.log("\nDuplicate override IDs:");
    issues.duplicateOverrides.forEach((x) =>
      console.log(`  ${x.id} (indexes ${x.firstIndex}, ${x.duplicateIndex})`)
    );
  }
  if (issues.emptyCategories.length) {
    console.log("\nEmpty categories:");
    issues.emptyCategories.forEach((x) => console.log(`  ${x.id}`));
  }
  if (issues.titleCollisions.length) {
    console.log(
      "\nWarnings — titles that match multiple feature IDs (override each ID explicitly):"
    );
    issues.titleCollisions.forEach((t) => {
      console.log(`  "${t.title}" → ${t.matchingIds.length} IDs`);
      t.matchingIds.forEach((id) => console.log(`    - ${id}`));
    });
  }
}

function printPreview(changes) {
  if (!changes.length) {
    console.log("No matching overrides to preview.");
    return;
  }
  console.log(`Preview — ${changes.length} feature row(s):\n`);
  for (const c of changes) {
    const mark = c.unchanged ? "(no change)" : "";
    console.log(`${c.title}`);
    console.log(`  id:      ${c.id}`);
    console.log(`  version: ${c.version || "(none)"}`);
    console.log(`  before:  [${c.before.join(", ")}]`);
    console.log(`  after:   [${c.after.join(", ")}] ${mark}`);
    console.log(
      `  primary: ${c.primaryBefore || "—"} → ${c.primaryAfter || "—"}`
    );
    if (c.note) console.log(`  note:    ${c.note}`);
    console.log("");
  }
}

function usage() {
  console.log(`Usage:
  node scripts/category-overrides.mjs validate
  node scripts/category-overrides.mjs dry-run [--id <feature-id>]
  node scripts/category-overrides.mjs lookup "<exact feature title>"
  node scripts/category-overrides.mjs add --id <feature-id> --categories Cat1[,Cat2] [--note "..."] [--dry-run]

Canonical categories come from data/releases.json → categories[].
Overrides live in data/category-overrides.json and are applied at display time.`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--id") args.id = argv[++i];
    else if (a === "--categories") args.categories = argv[++i];
    else if (a === "--note") args.note = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    } else args._.push(a);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || "validate";

  if (!existsSync(RELEASES)) {
    console.error(`Missing ${RELEASES}`);
    process.exit(1);
  }
  const releases = loadJson(RELEASES);
  const overrideDoc = loadOverridesFile();

  if (cmd === "validate") {
    const result = validateOverrides(releases, overrideDoc);
    printValidation(result);
    process.exit(result.ok ? 0 : 1);
  }

  if (cmd === "dry-run" || cmd === "preview") {
    const result = validateOverrides(releases, overrideDoc);
    printValidation(result);
    console.log("");
    const changes = previewChanges(releases, overrideDoc, {
      idFilter: args.id || null,
    });
    printPreview(changes);
    process.exit(result.ok ? 0 : 1);
  }

  if (cmd === "lookup") {
    const title = args._.slice(1).join(" ").trim();
    if (!title) {
      console.error('lookup requires an exact title, e.g. lookup "New Ambient Lighting Options"');
      process.exit(1);
    }
    const rows = lookupByTitle(releases, title);
    if (!rows.length) {
      console.log(`No features with exact title: "${title}"`);
      process.exit(1);
    }
    console.log(`Found ${rows.length} distinct feature ID(s) for "${title}":\n`);
    for (const r of rows) {
      console.log(`  id:         ${r.id}`);
      console.log(`  versions:   ${r.versions.join(", ")}`);
      console.log(`  automatic:  [${(r.categories || []).join(", ")}]`);
      console.log(`  primary:    ${r.primaryCategory || "—"}`);
      console.log("");
    }
    if (rows.length > 1) {
      console.log(
        "Manual review: title is not unique — add one override entry per feature id."
      );
    }
    process.exit(0);
  }

  if (cmd === "add") {
    if (!args.id || !args.categories) {
      console.error("add requires --id and --categories");
      usage();
      process.exit(1);
    }
    const categories = String(args.categories)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const entry = {
      id: args.id,
      categories,
      note: args.note || "",
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    const trial = {
      ...overrideDoc,
      overrides: [
        ...(overrideDoc.overrides || []).filter((o) => o.id !== entry.id),
        entry,
      ],
    };
    const result = validateOverrides(releases, trial);
    printValidation(result);
    console.log("");
    printPreview(previewChanges(releases, trial, { idFilter: entry.id }));

    if (!result.ok) {
      console.error("Refusing to save — fix validation errors first.");
      process.exit(1);
    }
    if (args.dryRun) {
      console.log("Dry-run only — overrides file not modified.");
      process.exit(0);
    }
    saveOverrides(trial);
    console.log(`Saved override for ${entry.id} → [${categories.join(", ")}]`);
    console.log(`Wrote ${OVERRIDES}`);
    process.exit(0);
  }

  usage();
  process.exit(1);
}

const isDirect =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
