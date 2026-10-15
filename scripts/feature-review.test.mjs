#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreFeature,
  compareReviewRows,
  summarizeReview,
  inferSourceQuality,
} from "./feature-review.mjs";

const official = {
  id: "a",
  title: "Preferred Routes",
  type: "official",
  description:
    "You can now save preferred Supercharger stops along a navigation route and the car will remember them for later trips with a detailed explanation of the on-screen flow.",
  image: "https://www.notateslaapp.com/images/example.png",
  models: ["S", "3"],
  version: "2026.26",
  releaseDate: "July 2026",
  releaseUrl: "https://www.notateslaapp.com/software-updates/2026.26/",
  source: undefined,
};

test("official record with image, URL, version, and models scores high", () => {
  const meta = scoreFeature(official);
  assert.equal(meta.sourceQuality, "official");
  assert.equal(meta.evidenceConfidence, "high");
  assert.equal(meta.hasImage, true);
  assert.ok(meta.reasons.length >= 4);
});

test("owner-reported historical row without URL or image is low confidence", () => {
  const meta = scoreFeature({
    id: "b",
    title: "Camp Mode",
    description: "Owner-reported approximately 2019.",
    image: null,
    models: [],
    version: "SOP",
    releaseDate: "approximately 2019",
    source: "tesla-model-s-x-2012-2019",
  });
  assert.equal(meta.sourceQuality, "owner_reported");
  assert.equal(meta.evidenceConfidence, "low");
  assert.equal(meta.reviewPriority, "high");
  assert.ok(meta.missingEvidence.includes("image"));
  assert.ok(meta.missingEvidence.includes("source_url"));
});

test("electrek professional media is not treated as official Tesla", () => {
  assert.equal(
    inferSourceQuality({
      source: "electrek",
      releaseUrl: "https://electrek.co/2017/03/20/tesla-list-features-software-updates/",
    }),
    "professional_media"
  );
});

test("default sort puts high-priority low-confidence first", () => {
  const rows = [
    { title: "Z", reviewPriority: "low", evidenceConfidence: "high" },
    { title: "A", reviewPriority: "high", evidenceConfidence: "low" },
    { title: "B", reviewPriority: "high", evidenceConfidence: "medium" },
  ].sort(compareReviewRows);
  assert.equal(rows[0].title, "A");
  assert.equal(rows[1].title, "B");
});

test("summary counts are derived from the same row set", () => {
  const rows = [
    scoreFeature(official),
    scoreFeature({ title: "x", description: "short", models: [] }),
  ];
  const sum = summarizeReview(rows);
  assert.equal(sum.evaluated, 2);
  assert.equal(sum.highConfidence + sum.mediumConfidence + sum.lowConfidence, 2);
  assert.ok(sum.missingImage >= 1);
});
