#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldPairElectrekWithSx,
  pairElectrekSxFeatures,
  combineElectrekSxDuplicates,
  featureGroupKey,
  SX_SOURCE,
  ELECTREK_SOURCE,
} from "./electrek-sx-dedupe.mjs";

test("pairs known 2012–2016 doubles and rejects lookalikes", () => {
  assert.equal(
    shouldPairElectrekWithSx(
      { title: "App Launcher" },
      { title: "App launcher" }
    ),
    true
  );
  assert.equal(
    shouldPairElectrekWithSx(
      { title: "Rated-range estimate" },
      { title: "Projected and rated range" }
    ),
    true
  );
  assert.equal(
    shouldPairElectrekWithSx(
      { title: "85-kWh battery and 265-mile EPA-rated range" },
      { title: "Projected and rated range" }
    ),
    false
  );
  assert.equal(
    shouldPairElectrekWithSx(
      { title: "Autopark" },
      { title: "Perpendicular autopark" }
    ),
    false
  );
  assert.equal(
    shouldPairElectrekWithSx(
      { title: "Perpendicular Autopark" },
      { title: "Perpendicular autopark" }
    ),
    true
  );
});

test("combine aligns Electrek onto the S/X card so grouping collapses to one key", () => {
  const payload = combineElectrekSxDuplicates({
    features: [
      {
        id: "ek-1",
        source: ELECTREK_SOURCE,
        title: "App launcher",
        description: "Electrek short note",
        version: "1.17.5",
        image: "https://example.com/app.png",
        models: ["S"],
        links: [],
        releaseUrl: "https://electrek.co/example",
      },
      {
        id: "sx-1",
        source: SX_SOURCE,
        title: "App Launcher",
        description: "S/X detailed note\n\nCaveat.",
        version: "v4.0 / v1.17.50",
        image: null,
        models: ["S"],
        links: [{ title: "Source", url: "https://example.com/sx" }],
      },
      {
        id: "keep-apart",
        source: ELECTREK_SOURCE,
        title: "Projected and rated range",
        description: "Range UI",
        models: ["S"],
      },
      {
        id: "sx-battery",
        source: SX_SOURCE,
        title: "85-kWh battery and 265-mile EPA-rated range",
        description: "Launch battery",
        models: ["S"],
      },
    ],
    releases: [
      {
        version: "1.17.5",
        source: ELECTREK_SOURCE,
        features: [{ id: "ek-1", title: "App launcher", description: "Electrek short note" }],
      },
    ],
  });

  const sx = payload.features.find((f) => f.id === "sx-1");
  const ek = payload.features.find((f) => f.id === "ek-1");
  assert.equal(ek.title, sx.title);
  assert.equal(ek.description, sx.description);
  assert.equal(ek.dedupedInto, "sx-1");
  assert.equal(sx.image, "https://example.com/app.png");
  assert.ok(sx.links.some((l) => /electrek/.test(l.url)));
  assert.equal(payload.features.filter((f) => f.id === "keep-apart")[0].title, "Projected and rated range");
  assert.equal(payload.electrekSxDedupe.paired, 1);

  const again = combineElectrekSxDuplicates(payload);
  assert.equal(again.electrekSxDedupe.paired, 1);
  assert.equal(again.features.find((f) => f.id === "ek-1").title, "App Launcher");
});

test("group key still unifies after Electrek title edits", () => {
  const payload = combineElectrekSxDuplicates({
    features: [
      {
        id: "ek-1",
        source: ELECTREK_SOURCE,
        title: "App launcher",
        description: "Electrek short note",
        models: ["S"],
      },
      {
        id: "sx-1",
        source: SX_SOURCE,
        title: "App Launcher",
        description: "S/X detailed note",
        models: ["S"],
      },
    ],
  });
  const sx = payload.features.find((f) => f.id === "sx-1");
  const ekEdited = {
    ...payload.features.find((f) => f.id === "ek-1"),
    title: "App launcher",
    description: "Manual Electrek wording",
  };
  assert.equal(featureGroupKey(sx), featureGroupKey(ekEdited));
  assert.notEqual(
    featureGroupKey({
      title: "85-kWh battery and 265-mile EPA-rated range",
      description: "Launch",
    }),
    featureGroupKey({
      title: "Projected and rated range",
      description: "Range UI",
    })
  );
});

test("one S/X feature can absorb two Electrek notes", () => {
  const pairs = pairElectrekSxFeatures([
    {
      id: "sx",
      source: SX_SOURCE,
      title: "Forward Collision Warning and Auto High Beam",
    },
    {
      id: "ek1",
      source: ELECTREK_SOURCE,
      title: "Forward collision warning to AP1 cars",
    },
    {
      id: "ek2",
      source: ELECTREK_SOURCE,
      title: "Auto high beam to AP1 cars",
    },
  ]);
  assert.equal(pairs.length, 2);
});
