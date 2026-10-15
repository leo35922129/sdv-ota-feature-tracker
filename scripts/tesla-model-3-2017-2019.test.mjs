#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SOURCE,
  parseCsv,
  slugify,
  formatReleaseDate,
  availabilityFromCaveat,
  importFromCsv,
  mergeModel3Historical,
  retainModel3Historical,
  stripModel3Historical,
} from "./tesla-model-3-2017-2019.mjs";

const csvPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "tesla-model-3-2017-2019.csv"
);

test("CSV parses to exactly 77 Feature-Level List rows", () => {
  const payload = importFromCsv(readFileSync(csvPath, "utf8"));
  assert.equal(payload.features.length, 77);
  const ids = payload.features.map((f) => f.id);
  assert.equal(new Set(ids).size, 77);
  assert.equal(payload.features.filter((f) => f.importKind === "SOP").length, 8);
  assert.equal(payload.features.filter((f) => f.importKind === "OTA").length, 69);
});

test("IDs follow tesla-model-3-{type}-{version}-{name} and stay unique", () => {
  const payload = importFromCsv(readFileSync(csvPath, "utf8"));
  for (const f of payload.features) {
    assert.match(f.id, /^tesla-model-3-(sop|ota)-/);
    assert.equal(f.models.join(), "3");
    assert.ok(f.title);
    assert.ok(f.description);
    assert.ok(f.version);
    assert.ok(f.releaseDate);
    assert.ok(f.categories.length);
    assert.equal(f.primaryCategory, f.categories[0]);
    assert.equal(f.source, SOURCE);
    assert.ok(f.links[0]?.url);
    assert.equal(f.image, null);
  }
  const noa = payload.features.filter((f) => f.title === "Navigate on Autopilot Beta");
  assert.equal(noa.length, 2);
  assert.notEqual(noa[0].id, noa[1].id);
  assert.notEqual(noa[0].version, noa[1].version);
});

test("SOP date formatting and uncertain dates are preserved", () => {
  assert.equal(formatReleaseDate("2017-07-28"), "July 28, 2017");
  assert.equal(formatReleaseDate("Before 2017-12-04"), "Before 2017-12-04");
  assert.equal(formatReleaseDate("May-June 2019"), "May-June 2019");
  assert.equal(slugify("2018.24 / 2018.24.1"), "2018-24-2018-24-1");
});

test("availability pills stay non-universal when the source is uncertain", () => {
  assert.equal(
    availabilityFromCaveat("Owner-maintained historical record; exact deployment date is uncertain."),
    "Owner-reported / uncertain"
  );
  assert.equal(
    availabilityFromCaveat("Optional Enhanced Autopilot package; region dependent."),
    "Optional / hardware-dependent"
  );
  assert.equal(
    availabilityFromCaveat("Standard launch equipment; based on contemporary launch coverage."),
    "Launch equipment"
  );
});

test("merge is idempotent and does not drop unrelated Tesla rows", () => {
  const payload = importFromCsv(readFileSync(csvPath, "utf8"));
  const seed = {
    features: [
      {
        id: "keep-me",
        title: "Existing",
        description: "Stay",
        categories: ["Vehicle OS"],
        source: "notateslaapp",
        version: "2026.26",
      },
    ],
    releases: [
      {
        version: "2026.26",
        features: [{ id: "keep-me", title: "Existing" }],
      },
    ],
    categories: ["Vehicle OS"],
  };
  const once = mergeModel3Historical(payload, seed);
  const twice = mergeModel3Historical(payload, once);
  const idsOnce = once.features.filter((f) => f.source === SOURCE).map((f) => f.id);
  const idsTwice = twice.features.filter((f) => f.source === SOURCE).map((f) => f.id);
  assert.equal(idsOnce.length, 77);
  assert.deepEqual([...idsOnce].sort(), [...idsTwice].sort());
  assert.ok(twice.features.some((f) => f.id === "keep-me"));
});

test("retain restores Model 3 rows dropped by a scrape rebuild", () => {
  const payload = importFromCsv(readFileSync(csvPath, "utf8"));
  const full = mergeModel3Historical(payload, { features: [], releases: [] });
  const dropped = { features: [{ id: "only-scrape", title: "X" }], releases: [] };
  const restored = retainModel3Historical(full, dropped, payload);
  assert.equal(restored.features.filter((f) => f.source === SOURCE).length, 77);
  assert.ok(restored.features.some((f) => f.id === "only-scrape"));
});

test("strip removes only Model 3 historical rows", () => {
  const payload = importFromCsv(readFileSync(csvPath, "utf8"));
  const full = mergeModel3Historical(payload, {
    features: [{ id: "keep-me", title: "Existing", categories: ["Vehicle OS"] }],
    releases: [],
  });
  const stripped = stripModel3Historical(full);
  assert.equal(stripped.features.filter((f) => f.source === SOURCE).length, 0);
  assert.ok(stripped.features.some((f) => f.id === "keep-me"));
});

test("parseCsv handles quoted commas and BOM", () => {
  const rows = parseCsv(
    '\uFEFFType,Feature\nOTA,"A, B",x\n'
  );
  assert.equal(rows[0][0], "Type");
  assert.equal(rows[1][1], "A, B");
});
