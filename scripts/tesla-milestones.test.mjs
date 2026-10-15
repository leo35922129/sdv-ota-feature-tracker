#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MILESTONE_MODELS,
  SORP_CATEGORIES,
  splitMilestoneFeatures,
  yearFromMilestoneVersion,
  compareMilestoneVersions,
  groupMilestonesByYear,
  groupOverviewMilestones,
  modelMilestoneData,
  sorpRowsForCategory,
  isOtaAddedSorpRow,
  ALL_MODELS_OVERVIEW,
  allModelsOverview,
} from "./tesla-milestones.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = JSON.parse(readFileSync(join(ROOT, "data/tesla-milestones.json"), "utf8"));

test("milestone feature names split on commas and drop a leading and", () => {
  assert.deepEqual(
    splitMilestoneFeatures(
      "Cabin-camera attention monitoring, Autopark refinements, and range-display improvements."
    ),
    [
      "Cabin-camera attention monitoring",
      "Autopark refinements",
      "range-display improvements",
    ]
  );
  assert.deepEqual(splitMilestoneFeatures(""), []);
});

test("milestone years come from the version string", () => {
  assert.equal(yearFromMilestoneVersion("2020.48.26"), 2020);
  assert.equal(yearFromMilestoneVersion("2021.44.25 / V11"), 2021);
  assert.equal(yearFromMilestoneVersion("no-year"), null);
});

test("milestone versions sort oldest first within a year", () => {
  assert.ok(compareMilestoneVersions("2020.48.26", "2020.4") > 0);
  assert.ok(compareMilestoneVersions("2021.36.8", "2021.36.x") > 0);
  const grouped = groupMilestonesByYear([
    { version: "2020.4", featuresText: "Camp Mode", significance: "Launch" },
    { version: "2021.36.x", featuresText: "Cabin camera", significance: "Monitor" },
    { version: "2020.48.26", featuresText: "Boombox", significance: "Parked use" },
  ]);
  assert.deepEqual(
    grouped.map((g) => g.year),
    [2020, 2021]
  );
  assert.deepEqual(
    grouped[0].items.map((item) => item.version),
    ["2020.4", "2020.48.26"]
  );
  assert.deepEqual(grouped[1].items[0].features, ["Cabin camera"]);
});

test("Tesla milestone JSON covers each model and the SORP categories", () => {
  assert.deepEqual(
    MILESTONE_MODELS.map((m) => m.id),
    ["3", "Y", "S", "X", "CT"]
  );
  assert.equal(SORP_CATEGORIES.length, 6);
  assert.equal(SORP_CATEGORIES.at(-1).id, "software-features");
  for (const model of MILESTONE_MODELS) {
    const data = modelMilestoneData(doc, model.id);
    assert.ok(data, `missing ${model.id}`);
    assert.ok(data.milestones.length > 0, `${model.id} has no milestones`);
    const grouped = groupMilestonesByYear(data.milestones);
    assert.ok(grouped.length > 0, `${model.id} has no grouped years`);
    assert.equal(grouped[0].year, Math.min(...grouped.map((g) => g.year)));
    for (const cat of SORP_CATEGORIES) {
      const rows = sorpRowsForCategory(data, cat.id);
      assert.ok(rows.length > 0, `${model.id} missing ${cat.id}`);
      assert.ok(rows[0].category);
      assert.ok(Array.isArray(rows[0].cells) && rows[0].cells.length >= 2);
    }
  }
  const modelY = modelMilestoneData(doc, "Y");
  const packaging = sorpRowsForCategory(modelY, "vehicle-packaging");
  assert.equal(packaging[0].category, "Launch timing");
  assert.match(packaging[0].detail, /March 2020/);
  const software = sorpRowsForCategory(modelY, "software-features");
  assert.match(software[0].category, /Software-controlled vehicle settings|Core vehicle/);
  assert.equal(
    software.some((row) => /sentry mode/i.test(row.category)),
    false
  );
  for (const model of MILESTONE_MODELS) {
    const rows = sorpRowsForCategory(modelMilestoneData(doc, model.id), "software-features");
    for (const row of rows) {
      assert.equal(isOtaAddedSorpRow(row, ["Software feature", "Category", "Initial availability"]), false);
      assert.equal(/\bOTA addition\b/i.test(row.cells?.[2] || ""), false);
    }
  }
  assert.equal(modelY.milestones[0].version, "2020.4");
  assert.match(modelY.milestones[0].significance, /software-defined crossover/);
});

test("All Vehicles milestone overview has the main OTA list and all-models SORP table", () => {
  const overview = allModelsOverview(doc);
  assert.equal(overview.milestones.length, ALL_MODELS_OVERVIEW.milestones.length);
  assert.equal(overview.sorp.columns.length, 6);
  assert.equal(overview.sorp.columns[1], "Model S");
  assert.equal(overview.sorp.rows.length, 8);
  assert.equal(overview.sorp.rows[0].category, "Launch date");
  assert.match(overview.sorp.rows[0].cells[1], /June 2012/);
  assert.match(overview.sorp.rows[0].cells[1], /Signature-series liftback/);
  assert.match(overview.sorp.rows[0].cells[5], /November 2023/);
  assert.equal(overview.sorp.rows[1].category, "Vehicle type");
  assert.equal(overview.sorp.rows[2].category, "Primary mission");
  const grouped = groupOverviewMilestones(overview.milestones);
  assert.ok(grouped[0].year <= grouped[grouped.length - 1].year);
  assert.equal(grouped.at(-1).items[0].version, "Ongoing");
  const launches = overview.milestones.filter((m) => m.kind === "model-launch");
  assert.deepEqual(
    launches.map((m) => `${m.year}:${m.version}`),
    ["2023:Cybertruck", "2020:Model Y", "2017:Model 3", "2015:Model X", "2012:Model S"]
  );
  const y2012 = grouped.find((g) => g.year === 2012);
  assert.equal(y2012.items.at(-1).kind, "model-launch");
  assert.equal(y2012.items.at(-1).version, "Model S");
  const y2017 = grouped.find((g) => g.year === 2017);
  assert.equal(y2017.items[0].version, "2017");
  assert.equal(y2017.items.at(-1).version, "Model 3");
  assert.match(
    overview.milestones.find((m) => m.version === "2012–14").significance,
    /Connected ownership foundation/
  );
  const app = readFileSync(join(ROOT, "app.js"), "utf8");
  assert.match(app, /renderAllModelsMilestoneChart/);
  assert.match(app, /Tesla all models SORP feature/);
});

test("index.html includes the Frequency and Milestone chart toggle", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  assert.match(html, /data-chart-view="frequency"/);
  assert.match(html, /data-chart-view="milestone"/);
  assert.match(html, />\s*OTA Frequency\s*</);
  assert.match(html, />\s*OTA Milestone\s*</);
});
