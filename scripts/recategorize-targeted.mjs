#!/usr/bin/env node
/**
 * Targeted Tesla category rules (additive) with manual-override protection.
 *
 * Usage:
 *   node scripts/recategorize-targeted.mjs              # dry-run (default)
 *   node scripts/recategorize-targeted.mjs --dry-run
 *   node scripts/recategorize-targeted.mjs --apply      # write releases.json + changelog
 *
 * Never mutates categories for IDs in feature-edits.json or category-overrides.json.
 * Does not remove existing valid tags — only adds required categories from rules.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadManualCategoryProtections,
  CATEGORY_SOURCE_AUTOMATIC,
  CATEGORY_SOURCE_MANUAL,
} from "./manual-category-protection.mjs";
import {
  featureIdentityKey,
  protectedIdentityKeys,
} from "./manual-category-lock.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RELEASES_PATH = join(ROOT, "data", "releases.json");
const REPORT_PATH = join(ROOT, "data", "recategorize-targeted-dry-run.json");
const CHANGELOG_PATH = join(ROOT, "data", "recategorize-targeted-changelog.json");

/** Canonical names — must match releases.json categories[] exactly. */
export const CANONICAL = {
  UI: "UI / Visualization",
  SAFETY: "Safety / Emergency",
  MOBILE: "Mobile App",
  LIGHTING: "Lighting",
  AUDIO: "Audio",
  CONNECTIVITY: "Connectivity",
};

function uniqueCats(cats) {
  const out = [];
  const seen = new Set();
  for (const c of cats || []) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

function catsEqual(a, b) {
  const aa = uniqueCats(a);
  const bb = uniqueCats(b);
  if (aa.length !== bb.length) return false;
  return aa.every((c, i) => c === bb[i]);
}

/**
 * Propose additive category tags for one feature based on full context.
 * Returns { add, reasons, ambiguous, ambiguousReasons, confidence }.
 */
export function proposeTargetedCategories(feature) {
  const title = String(feature?.title || "");
  const description = String(feature?.description || "");
  const text = `${title}\n${description}`;
  const add = [];
  const reasons = [];
  const ambiguousReasons = [];

  // --- Bluetooth / Wi-Fi / Cellular → Connectivity ---
  // Features about those radios — not Premium Connectivity subscription text,
  // and not incidental "requires WiFi / stream over cellular" prerequisites.
  {
    const titleHit =
      /\b(bluetooth|blue[\s-]?tooth|wi-?fi|\bwifi\b|cellular|\blte\b|\b5g\b)\b/i.test(
        title
      ) || /\bconnectivity icons?\b/i.test(title);
    const cleanedDesc = description
      .replace(/[^.]*premium connectivity[^.]*\./gi, " ")
      .replace(/[^.]*stream[^.]*cellular connection[^.]*\./gi, " ")
      .replace(/[^.]*requires[^.]*wi-?fi connection[^.]*\./gi, " ");
    const strongHit =
      /\b((?:new\s+)?(?:bluetooth|wi-?fi|wifi)\s+menu|bluetooth\s+(?:audio|pairing|device|player|improvement|gaming|game\s+controllers?|headphones?)|priority bluetooth|over bluetooth|switch to bluetooth|remain connected to wi-?fi|wi-?fi diagnostics|improved transition to cellular|connectivity icons?|cellular data icon|media source switches to bluetooth)\b/i.test(
        `${title}\n${cleanedDesc}`
      );
    // Skip weak tip/example mentions (e.g. "for example … over Bluetooth")
    const weakExampleOnly =
      !titleHit &&
      /\bfor example\b[^.]*\b(bluetooth|wi-?fi|wifi|cellular)\b/i.test(
        description
      );
    if ((titleHit || strongHit) && !weakExampleOnly) {
      add.push(CANONICAL.CONNECTIVITY);
      reasons.push("Bluetooth/Wi-Fi/Cellular → Connectivity");
    }
  }

  // --- Parental controls → Safety / Emergency ---
  if (/\bparental controls?\b/i.test(text)) {
    add.push(CANONICAL.SAFETY);
    reasons.push("parental controls → Safety / Emergency");
  }

  // --- Blind-spot monitoring / warnings / visibility → Safety / Emergency ---
  if (/\bblind[- ]?spots?\b/i.test(text)) {
    add.push(CANONICAL.SAFETY);
    reasons.push("blind-spot monitoring/warning/visibility → Safety / Emergency");
  }

  // --- Chimes / warning / alert / notification sounds → Safety + Audio ---
  if (
    /\b(chimes?|warning sounds?|alert sounds?|notification sounds?|audible (?:alerts?|warnings?)|cross[- ]traffic chime)\b/i.test(
      text
    )
  ) {
    add.push(CANONICAL.SAFETY, CANONICAL.AUDIO);
    reasons.push(
      "chimes/warning/alert/notification sounds → Safety / Emergency + Audio"
    );
  }

  // --- Tesla / mobile app → Mobile App ---
  // Prefer primary app surfaces; skip grab-bag titles with incidental mentions.
  const grabBagTitle =
    /^(minor updates|minor fixes|other updates|additional improvements|additional features)$/i.test(
      title
    );
  const mobileStrong =
    /\b(tesla app|mobile app|phone app|smartphone app)\b/i.test(title) ||
    /\b(from (?:the )?(?:tesla|mobile) app|in (?:the )?(?:tesla|mobile) app|via (?:the )?mobile app|requires (?:the )?(?:tesla|mobile) app|tesla app version|mobile app v?\d|open (?:your )?tesla app|tesla mobile app)\b/i.test(
      text
    );
  if (mobileStrong && !grabBagTitle) {
    add.push(CANONICAL.MOBILE);
    reasons.push("Tesla/mobile app → Mobile App");
  } else if (
    !grabBagTitle &&
    /\b(tesla app|mobile app)\b/i.test(text) &&
    !mobileStrong
  ) {
    ambiguousReasons.push(
      "incidental Tesla/mobile app mention — flagged for manual review (no auto tag)"
    );
  }

  // --- Lighting (exclude light show, traffic lights, visualization-only lighting) ---
  const lightingExcluded =
    /\b(light show|rave cave|traffic lights?|green light|daylight|moonlight|lightning|highlights?|slightly|lightly)\b/i.test(
      text
    );
  const lightingInVisualization =
    /\b(lighting in visualization|improved lighting in visualization|visualization (?:lighting|brightness))\b/i.test(
      text
    );

  if (lightingInVisualization) {
    add.push(CANONICAL.UI);
    reasons.push("lighting within visualization → UI / Visualization");
  } else if (!lightingExcluded) {
    const strongLighting =
      /\b(ambient light(?:ing)?|accent lights?|headlights?|dome lights?|puddle lights?|taillights?|matrix lights?|adaptive headlights?|interior lights?|fog lamps?|turn signals?)\b/i.test(
        text
      ) ||
      (/\blighting\b/i.test(text) &&
        !/\bvisualization\b/i.test(text) &&
        !/\bvisualiz/i.test(title));
    if (strongLighting) {
      add.push(CANONICAL.LIGHTING);
      reasons.push("lights/lighting functions → Lighting");
    }
  }

  // --- UI / icons / visualization ---
  const strongUi =
    /\b(user interface|\bui\b improvements?|iconography|visual updates?|smoother visualizations?|welcome animation)\b/i.test(
      text
    ) ||
    /\b(icons?|visualization|visual updates?|paint shop)\b/i.test(title) ||
    /\b(new icons?|updated icons?|app icons?|climate icons?|status icons?|icon pack)\b/i.test(
      text
    );

  if (strongUi) {
    add.push(CANONICAL.UI);
    reasons.push("UI/icons/visualization → UI / Visualization");
  } else if (
    /\bicons?\b/i.test(text) &&
    !/\b(encryption|bitcoin|iconic|app launcher)\b/i.test(text)
  ) {
    ambiguousReasons.push(
      "incidental 'icon' mention — flagged for manual review (no auto tag)"
    );
  }

  const uniqueAdd = uniqueCats(add);
  return {
    add: uniqueAdd,
    reasons: [...new Set(reasons)],
    ambiguous: ambiguousReasons.length > 0 && uniqueAdd.length === 0,
    ambiguousReasons,
    confidence: uniqueAdd.length ? "strong" : ambiguousReasons.length ? "weak" : "none",
  };
}

export function mergeProposedCategories(current, proposal) {
  return uniqueCats([...(current || []), ...(proposal.add || [])]);
}

export function classifyFeature(feature, protections, identityKeys = null) {
  const id = feature?.id;
  if (!id) {
    return {
      id: null,
      title: feature?.title || null,
      status: "invalid",
      reason: "missing feature id",
      currentTags: uniqueCats(feature?.categories),
      proposedTags: uniqueCats(feature?.categories),
      protected: false,
    };
  }

  const protection = protections.get(id);
  const identityLocked = Boolean(identityKeys?.has(featureIdentityKey(feature)));
  const currentTags = uniqueCats(feature.categories);
  const proposal = proposeTargetedCategories(feature);
  const proposedTags = mergeProposedCategories(currentTags, proposal);

  if (protection || identityLocked) {
    return {
      id,
      title: feature.title,
      version: feature.version || null,
      status: "manual_protected",
      currentTags,
      proposedTags: protection?.categories ? uniqueCats(protection.categories) : currentTags,
      wouldHaveProposed: proposedTags,
      reasons: proposal.reasons,
      protected: true,
      protectionSource: protection?.source || "manual_override",
      protectionCategories: protection?.categories || currentTags,
      classificationSource: protection?.source || "manual_override",
    };
  }

  if (proposal.ambiguous && catsEqual(currentTags, proposedTags)) {
    return {
      id,
      title: feature.title,
      version: feature.version || null,
      status: "ambiguous",
      currentTags,
      proposedTags: currentTags,
      reasons: proposal.ambiguousReasons,
      protected: false,
      classificationSource: CATEGORY_SOURCE_AUTOMATIC,
    };
  }

  if (catsEqual(currentTags, proposedTags)) {
    return {
      id,
      title: feature.title,
      version: feature.version || null,
      status: "unchanged",
      currentTags,
      proposedTags,
      reasons: proposal.reasons.length
        ? proposal.reasons.map((r) => `${r} (already tagged)`)
        : ["no targeted rule matched"],
      protected: false,
      classificationSource: CATEGORY_SOURCE_AUTOMATIC,
    };
  }

  return {
    id,
    title: feature.title,
    version: feature.version || null,
    status: "auto_update",
    currentTags,
    proposedTags,
    reasons: proposal.reasons,
    protected: false,
    classificationSource: CATEGORY_SOURCE_AUTOMATIC,
  };
}

function indexUniqueFeatures(data) {
  const byId = new Map();
  for (const f of data.features || []) {
    if (!f?.id) continue;
    if (!byId.has(f.id)) byId.set(f.id, f);
  }
  return byId;
}

function validateCanonical(categories, canonicalList) {
  const set = new Set(canonicalList);
  const invalid = [];
  for (const c of categories || []) {
    if (!set.has(c)) invalid.push(c);
  }
  return invalid;
}

export function runTargetedRecategorize({ apply = false } = {}) {
  const data = JSON.parse(readFileSync(RELEASES_PATH, "utf8"));
  const canonicalList = data.categories || [];
  const protections = loadManualCategoryProtections();
  const byId = indexUniqueFeatures(data);
  const identityKeys = protectedIdentityKeys(
    [...byId.values()],
    protections
  );

  const results = [];
  const invalidCategories = [];
  const missingIds = [];

  for (const [id, feature] of byId) {
    const row = classifyFeature(feature, protections, identityKeys);
    results.push(row);

    const check = validateCanonical(row.proposedTags, canonicalList);
    if (check.length) {
      invalidCategories.push({ id, invalid: check });
    }
  }

  // Also scan nested release features for missing top-level ids
  for (const r of data.releases || []) {
    for (const f of r.features || []) {
      if (!f?.id) {
        missingIds.push({ title: f.title, version: r.version });
        continue;
      }
      if (!byId.has(f.id)) {
        missingIds.push({ id: f.id, title: f.title, version: r.version });
      }
    }
  }

  const counts = {
    totalUniqueFeatures: byId.size,
    unchanged: results.filter((r) => r.status === "unchanged").length,
    autoUpdate: results.filter((r) => r.status === "auto_update").length,
    manualProtected: results.filter((r) => r.status === "manual_protected").length,
    ambiguous: results.filter((r) => r.status === "ambiguous").length,
    invalid: results.filter((r) => r.status === "invalid").length,
  };

  const proposedChanges = results.filter((r) => r.status === "auto_update");
  const protectedHits = results.filter(
    (r) =>
      r.status === "manual_protected" &&
      r.wouldHaveProposed &&
      !catsEqual(r.currentTags, r.wouldHaveProposed)
  );
  const ambiguous = results.filter((r) => r.status === "ambiguous");

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    canonicalCategories: canonicalList,
    protectionCounts: {
      protectedIds: protections.size,
      sources: {
        featureEditsOrOverrides: protections.size,
      },
    },
    counts,
    validation: {
      invalidCategories,
      missingIds: missingIds.slice(0, 50),
      missingIdCount: missingIds.length,
    },
    proposedChanges,
    manuallyProtectedWouldChange: protectedHits,
    ambiguousForManualReview: ambiguous,
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

  if (!apply) {
    return { report, applied: false, path: REPORT_PATH };
  }

  if (invalidCategories.length) {
    throw new Error(
      `Refusing to apply: ${invalidCategories.length} features have invalid proposed categories`
    );
  }

  const changeById = new Map(
    proposedChanges.map((c) => [c.id, c])
  );
  const timestamp = new Date().toISOString();
  const changelogEntries = [];

  function applyToFeature(f) {
    const change = changeById.get(f.id);
    if (!change) return f;
    if (protections.has(f.id)) return f; // belt-and-suspenders

    const previousTags = uniqueCats(f.categories);
    const nextTags = uniqueCats(change.proposedTags);
    f.categories = nextTags;
    f.primaryCategory = nextTags[0] || f.primaryCategory;
    f.categoriesAutomatic = previousTags;
    f.categoryClassificationSource = CATEGORY_SOURCE_AUTOMATIC;
    return f;
  }

  for (const r of data.releases || []) {
    for (const f of r.features || []) {
      applyToFeature(f);
    }
  }

  const seenChangelog = new Set();
  data.features = (data.features || []).map((f) => {
    const next = applyToFeature({ ...f });
    const change = changeById.get(f.id);
    if (change && !seenChangelog.has(f.id)) {
      seenChangelog.add(f.id);
      changelogEntries.push({
        id: f.id,
        title: f.title,
        previousTags: change.currentTags,
        newTags: change.proposedTags,
        reason: change.reasons.join("; "),
        timestamp,
        classificationSource: CATEGORY_SOURCE_AUTOMATIC,
      });
    }
    return next;
  });

  // Recompute category counts
  const categoryCounts = Object.fromEntries(canonicalList.map((c) => [c, 0]));
  for (const f of data.features) {
    for (const c of f.categories || []) {
      if (categoryCounts[c] != null) categoryCounts[c]++;
    }
  }
  data.categoryCounts = categoryCounts;
  data.updatedAt = timestamp;

  writeFileSync(RELEASES_PATH, JSON.stringify(data, null, 2) + "\n");

  let priorLog = { version: 1, entries: [] };
  if (existsSync(CHANGELOG_PATH)) {
    try {
      priorLog = JSON.parse(readFileSync(CHANGELOG_PATH, "utf8"));
    } catch {
      /* start fresh */
    }
  }
  const changelog = {
    version: 1,
    description:
      "Additive targeted category rule applications. Manual overrides never written here.",
    updatedAt: timestamp,
    entries: [...(priorLog.entries || []), ...changelogEntries],
  };
  writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2) + "\n");

  report.mode = "apply";
  report.appliedCount = changelogEntries.length;
  report.changelogPath = CHANGELOG_PATH;
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

  return { report, applied: true, changelogEntries, path: REPORT_PATH };
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const { report, applied, path } = runTargetedRecategorize({ apply });

  console.log(`Mode: ${applied ? "APPLY" : "DRY-RUN"}`);
  console.log(`Report: ${path}`);
  console.log("Counts:", report.counts);
  console.log(
    `Protected IDs skipped (would have changed): ${report.manuallyProtectedWouldChange.length}`
  );
  console.log(`Ambiguous for review: ${report.ambiguousForManualReview.length}`);
  console.log(`Proposed auto updates: ${report.proposedChanges.length}`);
  if (!applied) {
    console.log("\nNo data modified. Re-run with --apply to write changes.");
  } else {
    console.log(`Applied ${report.appliedCount} unique feature id updates.`);
  }
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main();
}
