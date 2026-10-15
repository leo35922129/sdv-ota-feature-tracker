#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeElectrekIntoReleases,
  retainElectrekFeatures,
  loadElectrekCache,
} from "./scrape-electrek-tesla.mjs";
import { yearFromRelease } from "./chart-detail.mjs";

test("Electrek 2012–2016 features merge as card-shaped Tesla rows", () => {
  const electrek = {
    scrapedAt: "2026-08-14T00:00:00.000Z",
    features: [
      {
        id: "electrek-1.9.11-projected-and-rated-range-0",
        title: "Projected and rated range",
        type: "historical",
        description: "Shows projected and rated range.",
        image: "https://example.com/range.png",
        links: [],
        models: ["S"],
        categories: ["Range / Charging / Energy"],
        primaryCategory: "Range / Charging / Energy",
        version: "1.9.11",
        releaseDate: "September 23, 2012",
        source: "electrek",
      },
    ],
    releases: [
      {
        version: "1.9.11",
        releaseDate: "September 23, 2012",
        url: "https://electrek.co/example",
        source: "electrek",
        features: [
          {
            id: "electrek-1.9.11-projected-and-rated-range-0",
            title: "Projected and rated range",
            type: "historical",
            description: "Shows projected and rated range.",
            image: null,
            categories: ["Range / Charging / Energy"],
          },
        ],
      },
    ],
  };

  const merged = mergeElectrekIntoReleases(electrek, {
    source: "https://www.notateslaapp.com/software-updates/history/",
    categories: ["Range / Charging / Energy", "Vehicle OS"],
    categoryCounts: { "Range / Charging / Energy": 0, "Vehicle OS": 1 },
    releases: [
      {
        version: "2026.26",
        releaseDate: "July 26, 2026",
        features: [],
      },
    ],
    features: [
      {
        id: "summer-update",
        title: "Summer Update",
        version: "2026.26",
        categories: ["Vehicle OS"],
      },
    ],
  });

  assert.equal(merged.electrek.addedFeatures, 1);
  assert.equal(merged.electrek.addedReleases, 1);
  assert.equal(merged.featureCount, 2);
  assert.equal(merged.releaseCount, 2);

  const historical = merged.features.find((f) => f.source === "electrek");
  assert.ok(historical);
  assert.equal(historical.version, "1.9.11");
  assert.equal(yearFromRelease(historical.releaseDate, historical.version), 2012);
  assert.equal(historical.image, "https://example.com/range.png");
  assert.deepEqual(historical.categories, ["Range / Charging / Energy"]);
  assert.ok(Array.isArray(historical.links));

  const nested = merged.releases.find((r) => r.version === "1.9.11")?.features[0];
  assert.equal(nested.source, "electrek");
  assert.equal(nested.image, "https://example.com/range.png");
  assert.equal(nested.type, "historical");
});

function teslaOnlyPayload() {
  return {
    source: "https://www.notateslaapp.com/software-updates/history/",
    categories: ["Range / Charging / Energy", "Vehicle OS"],
    categoryCounts: { "Range / Charging / Energy": 0, "Vehicle OS": 1 },
    releases: [
      {
        version: "2026.26",
        releaseDate: "July 26, 2026",
        features: [],
      },
    ],
    features: [
      {
        id: "summer-update",
        title: "Summer Update",
        version: "2026.26",
        categories: ["Vehicle OS"],
      },
    ],
  };
}

function electrek2012Payload() {
  return {
    scrapedAt: "2026-08-14T00:00:00.000Z",
    features: [
      {
        id: "electrek-1.9.11-projected-and-rated-range-0",
        title: "Projected and rated range",
        type: "historical",
        description: "Shows projected and rated range.",
        image: "https://example.com/range.png",
        links: [],
        models: ["S"],
        categories: ["Range / Charging / Energy"],
        primaryCategory: "Range / Charging / Energy",
        version: "1.9.11",
        releaseDate: "September 23, 2012",
        source: "electrek",
      },
    ],
    releases: [
      {
        version: "1.9.11",
        releaseDate: "September 23, 2012",
        url: "https://electrek.co/example",
        source: "electrek",
        features: [
          {
            id: "electrek-1.9.11-projected-and-rated-range-0",
            title: "Projected and rated range",
            type: "historical",
            description: "Shows projected and rated range.",
            image: "https://example.com/range.png",
            categories: ["Range / Charging / Energy"],
          },
        ],
      },
    ],
  };
}

test("a NotaTeslaApp-only rebuild still restores Electrek 2012 cards from cache payload", () => {
  const rebuilt = teslaOnlyPayload();
  const merged = mergeElectrekIntoReleases(electrek2012Payload(), rebuilt);
  const historical = merged.features.filter((f) => f.source === "electrek");
  assert.equal(historical.length, 1);
  assert.equal(yearFromRelease(historical[0].releaseDate, historical[0].version), 2012);
  assert.ok(merged.features.some((f) => f.id === "summer-update"));
});

test("retainElectrekFeatures restores cards dropped by an incremental scrape", () => {
  const previous = mergeElectrekIntoReleases(electrek2012Payload(), teslaOnlyPayload());
  const dropped = teslaOnlyPayload();
  const retained = retainElectrekFeatures(previous, dropped, electrek2012Payload());
  assert.equal(
    retained.features.filter((f) => f.source === "electrek").length,
    1
  );
  assert.equal(
    yearFromRelease(
      retained.features.find((f) => f.source === "electrek").releaseDate,
      "1.9.11"
    ),
    2012
  );
  assert.ok(retained.features.some((f) => f.id === "summer-update"));
});

test("retainElectrekFeatures is a no-op when Electrek cards are already present", () => {
  const merged = mergeElectrekIntoReleases(electrek2012Payload(), teslaOnlyPayload());
  const again = retainElectrekFeatures(merged, merged, electrek2012Payload());
  assert.equal(again.features.filter((f) => f.source === "electrek").length, 1);
});

test("Electrek cache covers Tesla feature years 2012 through 2016", () => {
  const cache = loadElectrekCache();
  assert.ok(cache?.features?.length, "expected data/electrek-tesla-features.json");
  const years = new Set(
    cache.features.map((f) => yearFromRelease(f.releaseDate, f.version))
  );
  for (const year of [2012, 2013, 2014, 2015, 2016]) {
    assert.ok(years.has(year), `Electrek cache missing year ${year}`);
  }
});
