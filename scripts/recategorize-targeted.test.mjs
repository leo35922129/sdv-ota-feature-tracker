#!/usr/bin/env node
/**
 * Tests for targeted category rules and manual-override protection.
 * Run: node --test scripts/recategorize-targeted.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import {
  proposeTargetedCategories,
  mergeProposedCategories,
  classifyFeature,
  CANONICAL,
} from "./recategorize-targeted.mjs";
import {
  loadManualCategoryProtections,
  CATEGORY_SOURCE_MANUAL,
  ROOT,
  EDITS_PATH,
  OVERRIDES_PATH,
} from "./manual-category-protection.mjs";
import { upsertEdits, loadEditsDoc } from "./feature-edits.mjs";

const EDITS_BACKUP = join(ROOT, "data", "feature-edits.test-targeted-backup.json");
const OVERRIDES_BACKUP = join(
  ROOT,
  "data",
  "category-overrides.test-targeted-backup.json"
);

const originalEdits = existsSync(EDITS_PATH)
  ? readFileSync(EDITS_PATH, "utf8")
  : null;
const originalOverrides = existsSync(OVERRIDES_PATH)
  ? readFileSync(OVERRIDES_PATH, "utf8")
  : null;

before(() => {
  if (originalEdits != null) writeFileSync(EDITS_BACKUP, originalEdits);
  if (originalOverrides != null) writeFileSync(OVERRIDES_BACKUP, originalOverrides);
  writeFileSync(
    EDITS_PATH,
    JSON.stringify({ version: 1, edits: [] }, null, 2) + "\n"
  );
  writeFileSync(
    OVERRIDES_PATH,
    JSON.stringify({ version: 1, overrides: [] }, null, 2) + "\n"
  );
});

after(() => {
  if (originalEdits != null) writeFileSync(EDITS_PATH, originalEdits);
  else
    writeFileSync(
      EDITS_PATH,
      JSON.stringify({ version: 1, edits: [] }, null, 2) + "\n"
    );
  if (originalOverrides != null) writeFileSync(OVERRIDES_PATH, originalOverrides);
  else
    writeFileSync(
      OVERRIDES_PATH,
      JSON.stringify({ version: 1, overrides: [] }, null, 2) + "\n"
    );
  if (existsSync(EDITS_BACKUP)) rmSync(EDITS_BACKUP);
  if (existsSync(OVERRIDES_BACKUP)) rmSync(OVERRIDES_BACKUP);
});

test("rule: Bluetooth / Wi-Fi / Cellular → Connectivity", () => {
  const bt = proposeTargetedCategories({
    title: "Bluetooth Menu",
    description: "Improved Bluetooth pairing.",
  });
  assert.ok(bt.add.includes(CANONICAL.CONNECTIVITY));

  const wifi = proposeTargetedCategories({
    title: "Remain Connected to Wi-Fi in Drive",
    description: "Stay on Wi-Fi while driving.",
  });
  assert.ok(wifi.add.includes(CANONICAL.CONNECTIVITY));

  const cellular = proposeTargetedCategories({
    title: "Improved Transition to Cellular",
    description: "Smoother handoff to cellular data.",
  });
  assert.ok(cellular.add.includes(CANONICAL.CONNECTIVITY));

  const premiumOnly = proposeTargetedCategories({
    title: "YouTube Music",
    description: "Requires Premium Connectivity or an active WiFi connection.",
  });
  assert.ok(!premiumOnly.add.includes(CANONICAL.CONNECTIVITY));

  const streamCellular = proposeTargetedCategories({
    title: "Apple Music",
    description:
      "Stream music. Note: A Premium Connectivity subscription is required to stream Apple Music over a cellular connection.",
  });
  assert.ok(!streamCellular.add.includes(CANONICAL.CONNECTIVITY));
});

test("rule: UI / icons / visualization", () => {
  const p = proposeTargetedCategories({
    title: "New Climate Icons",
    description: "Updated climate icons on the touchscreen.",
  });
  assert.ok(p.add.includes(CANONICAL.UI));
});

test("rule: parental controls → Safety / Emergency", () => {
  const p = proposeTargetedCategories({
    title: "Parental Controls",
    description: "Restrict Arcade games with parental controls.",
  });
  assert.ok(p.add.includes(CANONICAL.SAFETY));
});

test("rule: Tesla mobile app → Mobile App", () => {
  const p = proposeTargetedCategories({
    title: "Tesla App FSD",
    description: "Start Full Self-Driving from the Tesla app.",
  });
  assert.ok(p.add.includes(CANONICAL.MOBILE));
});

test("rule: lighting → Lighting", () => {
  const p = proposeTargetedCategories({
    title: "Ambient Lighting",
    description: "New ambient lighting colors for the cabin.",
  });
  assert.ok(p.add.includes(CANONICAL.LIGHTING));
});

test("rule: blind spot → Safety / Emergency", () => {
  const p = proposeTargetedCategories({
    title: "Blind Spot Warning While Parked",
    description: "Alerts when a vehicle is in your blind spot.",
  });
  assert.ok(p.add.includes(CANONICAL.SAFETY));
});

test("rule: chimes → Safety / Emergency + Audio (multi-category)", () => {
  const p = proposeTargetedCategories({
    title: "Rear Cross-Traffic Chime",
    description: "A chime plays when cross traffic is detected.",
  });
  assert.ok(p.add.includes(CANONICAL.SAFETY));
  assert.ok(p.add.includes(CANONICAL.AUDIO));
  assert.ok(p.add.length >= 2);
});

test("additive merge keeps existing tags", () => {
  const current = ["Gaming"];
  const proposal = proposeTargetedCategories({
    title: "Parental Controls",
    description: "Parental controls for Arcade.",
  });
  const merged = mergeProposedCategories(current, proposal);
  assert.ok(merged.includes("Gaming"));
  assert.ok(merged.includes(CANONICAL.SAFETY));
});

test("manual overrides are never changed by classifyFeature", () => {
  writeFileSync(
    EDITS_PATH,
    JSON.stringify(
      {
        version: 1,
        edits: [
          {
            id: "protected-feature-1",
            categories: ["Gaming"],
            categorySource: CATEGORY_SOURCE_MANUAL,
          },
        ],
      },
      null,
      2
    ) + "\n"
  );
  const protections = loadManualCategoryProtections();
  assert.ok(protections.has("protected-feature-1"));

  const row = classifyFeature(
    {
      id: "protected-feature-1",
      title: "Parental Controls",
      description: "Parental controls and a chime for blind spot.",
      categories: ["Gaming"],
    },
    protections
  );
  assert.equal(row.status, "manual_protected");
  assert.deepEqual(row.proposedTags, ["Gaming"]);
  assert.ok(row.wouldHaveProposed.includes(CANONICAL.SAFETY));
});

test("later OTA copies of a manually tagged feature are not auto-retagged", () => {
  writeFileSync(
    EDITS_PATH,
    JSON.stringify(
      {
        version: 1,
        edits: [
          {
            id: "seat-heater-original",
            categories: ["Comfort / Climate"],
            categorySource: CATEGORY_SOURCE_MANUAL,
          },
        ],
      },
      null,
      2
    ) + "\n"
  );
  const original = {
    id: "seat-heater-original",
    title: "Seat Heater",
    description: "Warm the seats.",
    categories: ["Comfort / Climate"],
  };
  const newer = {
    id: "seat-heater-new-ota",
    title: "Seat Heater",
    description: "Warm the seats.",
    categories: ["Vehicle OS"],
  };
  const protections = loadManualCategoryProtections();
  const identityKeys = new Set([`${original.title}\n${original.description}`]);
  const row = classifyFeature(newer, protections, identityKeys);
  assert.equal(row.status, "manual_protected");
  assert.deepEqual(row.proposedTags, ["Vehicle OS"]);
});

test("upsert marks categorySource as manual_override", () => {
  const releases = JSON.parse(
    readFileSync(join(ROOT, "data", "releases.json"), "utf8")
  );
  const f = releases.features.find((x) => x.id);
  assert.ok(f);
  const saved = upsertEdits({
    ids: [f.id],
    title: f.title,
    description: f.description || "",
    categories: ["Lighting", "Display"],
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.edits[0].categorySource, CATEGORY_SOURCE_MANUAL);
  const doc = loadEditsDoc();
  const entry = doc.edits.find((e) => e.id === f.id);
  assert.equal(entry.categorySource, CATEGORY_SOURCE_MANUAL);
});

test("idempotent: already-tagged features stay unchanged", () => {
  const protections = new Map();
  const row = classifyFeature(
    {
      id: "already-ok",
      title: "Ambient Lighting",
      description: "Ambient lighting options.",
      categories: ["Lighting"],
    },
    protections
  );
  assert.equal(row.status, "unchanged");
});

test("lighting in visualization maps to UI, not Lighting", () => {
  const p = proposeTargetedCategories({
    title: "Improved Lighting in Visualization",
    description: "Better lighting in the driving visualization.",
  });
  assert.ok(p.add.includes(CANONICAL.UI));
  assert.ok(!p.add.includes(CANONICAL.LIGHTING));
});
