#!/usr/bin/env node
/**
 * Tests for Tesla tag-name aliases (name-only, no category moves).
 * Run: node --test scripts/category-aliases.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TESLA_CATEGORY_ALIASES,
  canonicalTeslaCategoryName,
  normalizeTeslaCategories,
  normalizeTeslaFeatureTags,
} from "./category-aliases.mjs";

test("explicit examples map to canonical Tesla names", () => {
  assert.equal(
    canonicalTeslaCategoryName("FSD"),
    "Autopilot / Full Self-Driving"
  );
  assert.equal(canonicalTeslaCategoryName("fsd"), "Autopilot / Full Self-Driving");
  assert.equal(canonicalTeslaCategoryName("driver profile"), "Profile");
  assert.equal(canonicalTeslaCategoryName("Driver Profile"), "Profile");
  assert.equal(
    canonicalTeslaCategoryName("charging"),
    "Range / Charging / Energy"
  );
  assert.equal(
    canonicalTeslaCategoryName("Charging"),
    "Range / Charging / Energy"
  );
});

test("canonical names are left unchanged", () => {
  for (const name of Object.values(TESLA_CATEGORY_ALIASES)) {
    assert.equal(canonicalTeslaCategoryName(name), name);
  }
  assert.equal(canonicalTeslaCategoryName("Lighting"), "Lighting");
  assert.equal(canonicalTeslaCategoryName("Vehicle OS"), "Vehicle OS");
});

test("normalize keeps category order and drops duplicates after rename", () => {
  assert.deepEqual(
    normalizeTeslaCategories([
      "FSD",
      "Autopilot / Full Self-Driving",
      "Mobile App",
    ]),
    ["Autopilot / Full Self-Driving", "Mobile App"]
  );
  assert.deepEqual(
    normalizeTeslaCategories(["Charging", "Map / Navigation / Trip"]),
    ["Range / Charging / Energy", "Map / Navigation / Trip / Route"]
  );
});

test("protected-style rows keep the same category slots after a name-only update", () => {
  const feature = {
    id: "speed-profiles-manual",
    title: "Speed Profiles",
    categories: ["FSD", "Driver Profile"],
    primaryCategory: "FSD",
  };
  const next = normalizeTeslaFeatureTags(feature);
  assert.deepEqual(next.categories, [
    "Autopilot / Full Self-Driving",
    "Profile",
  ]);
  assert.equal(next.primaryCategory, "Autopilot / Full Self-Driving");
  assert.equal(next.categories.length, feature.categories.length);
});
