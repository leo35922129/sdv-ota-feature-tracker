#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importFromCsv as importModel3 } from "./tesla-model-3-2017-2019.mjs";
import {
  SOURCE,
  MODEL3_SOURCE,
  importFromCsv,
  mergeModelSXHistorical,
  retainModelSXHistorical,
  stripModelSXHistorical,
  classifyAgainstModel3,
  normalizeFeatureTitle,
  displayVersion,
  modelsFromRow,
} from "./tesla-model-s-x-2012-2019.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = join(root, "data", "tesla-model-s-x-2012-2019.csv");
const m3Csv = join(root, "data", "tesla-model-3-2017-2019.csv");

function seedWithModel3() {
  const m3 = importModel3(readFileSync(m3Csv, "utf8"));
  return {
    features: m3.features.map((f) => ({ ...f, source: MODEL3_SOURCE })),
    releases: m3.releases,
    categories: m3.categories,
  };
}

test("CSV parses to 150 rows with expected SOP/OTA and coverage counts", () => {
  const payload = importFromCsv(readFileSync(csvPath, "utf8"));
  assert.equal(payload.features.length, 150);
  assert.equal(new Set(payload.features.map((f) => f.id)).size, 150);
  assert.equal(payload.features.filter((f) => f.importKind === "SOP").length, 25);
  assert.equal(payload.features.filter((f) => f.importKind === "OTA").length, 125);
  const coverage = payload.features.reduce((acc, f) => {
    acc[f.modelCoverage] = (acc[f.modelCoverage] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(coverage, { S: 77, X: 14, "S/X": 51, "S/X/3": 8 });
});

test("SOP / June 22, 2012 display and badges follow source coverage", () => {
  assert.equal(displayVersion("SOP", "SOP", "June 22, 2012"), "SOP / June 22, 2012");
  assert.deepEqual(
    modelsFromRow({ model_s: "true", model_x: "true", model_3: "true" }),
    ["S", "X", "3"]
  );
  const payload = importFromCsv(readFileSync(csvPath, "utf8"));
  const touch = payload.features.find((f) =>
    f.title.includes("17-inch touchscreen and digital instrument cluster")
  );
  assert.equal(touch.version, "SOP / June 22, 2012");
  assert.deepEqual(touch.models, ["S"]);
});

test("only exact S/X/3 Smart Summon Beta 2019.36.2.1 merges with Model 3", () => {
  const sx = importFromCsv(readFileSync(csvPath, "utf8"));
  const seed = seedWithModel3();
  const audit = classifyAgainstModel3(sx.features, seed.features);
  assert.equal(audit.enriched.length, 1);
  assert.equal(audit.enriched[0].title, "Smart Summon (Beta)");
  assert.equal(audit.enriched[0].version, "2019.36.2.1");
  assert.equal(audit.keptSeparate.length, 7);
  assert.ok(
    audit.rejected.some((r) => r.title === "Camp Mode" && r.sxVersion === "2019.40.50.1")
  );
  assert.ok(
    audit.rejected.some((r) => r.title === "Web browser" && r.sxVersion === "2019.32.2.1")
  );
});

test("merge enriches Model 3 Smart Summon and does not duplicate it", () => {
  const sx = importFromCsv(readFileSync(csvPath, "utf8"));
  const once = mergeModelSXHistorical(sx, seedWithModel3());
  const twice = mergeModelSXHistorical(sx, once);
  const sxCards = once.features.filter((f) => f.source === SOURCE);
  const smart = once.features.find(
    (f) => f.id === "tesla-model-3-ota-2019-36-2-1-smart-summon-beta"
  );
  assert.equal(sxCards.length, 149);
  assert.equal(once.features.filter((f) => f.source === MODEL3_SOURCE).length, 77);
  assert.deepEqual(smart.models.sort(), ["3", "S", "X"]);
  assert.equal(smart.sx3Enriched, true);
  assert.equal(smart.source, MODEL3_SOURCE);
  assert.equal(
    once.features.filter((f) => /smart summon/i.test(f.title) && f.version === "2019.36.2.1")
      .length,
    1
  );
  assert.deepEqual(
    sxCards.map((f) => f.id).sort(),
    twice.features.filter((f) => f.source === SOURCE).map((f) => f.id).sort()
  );
  assert.equal(normalizeFeatureTitle("Smart Summon (Beta)"), "smart summon");
});

test("retain restores S/X rows after a scrape drop", () => {
  const sx = importFromCsv(readFileSync(csvPath, "utf8"));
  const full = mergeModelSXHistorical(sx, seedWithModel3());
  const dropped = {
    features: [
      { id: "only-scrape", title: "X", source: "notateslaapp" },
      ...full.features.filter((f) => f.source === MODEL3_SOURCE),
    ],
    releases: [],
  };
  const restored = retainModelSXHistorical(full, dropped, sx);
  assert.equal(restored.features.filter((f) => f.source === SOURCE).length, 149);
  assert.ok(restored.features.some((f) => f.id === "only-scrape"));
  const smart = restored.features.find(
    (f) => f.id === "tesla-model-3-ota-2019-36-2-1-smart-summon-beta"
  );
  assert.equal(smart.sx3Enriched, true);
});

test("strip removes S/X rows and reverts Model 3 enrichment", () => {
  const sx = importFromCsv(readFileSync(csvPath, "utf8"));
  const full = mergeModelSXHistorical(sx, seedWithModel3());
  const stripped = stripModelSXHistorical(full);
  assert.equal(stripped.features.filter((f) => f.source === SOURCE).length, 0);
  const smart = stripped.features.find(
    (f) => f.id === "tesla-model-3-ota-2019-36-2-1-smart-summon-beta"
  );
  assert.deepEqual(smart.models, ["3"]);
  assert.equal(smart.sx3Enriched, undefined);
});
