#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isExcludedTeslaFeature,
  withoutExcludedTeslaFeatures,
} from "./tesla-feature-exclusions.mjs";

test("excludes the Tesla Summer Update intro card", () => {
  assert.equal(
    isExcludedTeslaFeature({
      id: "2026.26-summer-update",
      title: "Summer Update",
      description: "Swipe up to see your new features in the 2026 Summer Update.",
    }),
    true
  );
  assert.equal(
    isExcludedTeslaFeature({
      id: "summer-update-2026-26-6-detail",
      title: "Summer Update",
      description: "Swipe up to see your new features in the 2026 Summer Update.",
    }),
    true
  );
});

test("keeps real Tesla feature notes", () => {
  assert.equal(
    isExcludedTeslaFeature({
      id: "2026.26-hey-grok",
      title: "Hey Grok",
      description: "You can now talk to Grok, an intelligent assistant built by xAI.",
    }),
    false
  );
  const kept = withoutExcludedTeslaFeatures([
    { id: "2026.26-summer-update", title: "Summer Update" },
    { id: "2026.26-hey-grok", title: "Hey Grok" },
  ]);
  assert.deepEqual(
    kept.map((f) => f.id),
    ["2026.26-hey-grok"]
  );
});
