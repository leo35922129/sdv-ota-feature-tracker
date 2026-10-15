#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidateAllowedOnProduction,
  productionImageFromDecision,
  capCandidates,
  isGeneratedHistoricalMisuse,
} from "./image-review.mjs";
import { recommend, recommendationAgentStatus, gleanChatConfigured } from "./agents/recommendation-agent.mjs";
import { findCandidates } from "./agents/image-search-agent.mjs";

const real = {
  candidateId: "c1",
  featureId: "f1",
  imageUrl: "https://example.com/ui.png",
  sourceType: "official",
  evidenceLevel: "direct_feature_evidence",
  generated: false,
  reviewStatus: "approved",
  confidence: "high",
  licenseStatus: "ok",
};

test("only approved non-generated candidates may be assigned to production", () => {
  const decision = {
    featureId: "f1",
    status: "approved",
    primaryCandidate: "c1",
  };
  assert.equal(candidateAllowedOnProduction(real, decision), true);
  assert.equal(
    candidateAllowedOnProduction({ ...real, generated: true }, decision),
    false
  );
  assert.equal(
    candidateAllowedOnProduction(real, { ...decision, status: "needs-review" }),
    false
  );
  const assigned = productionImageFromDecision([real], decision);
  assert.equal(assigned.image, real.imageUrl);
});

test("generated images are conceptual-only and never historical evidence", () => {
  assert.equal(
    isGeneratedHistoricalMisuse({
      generated: true,
      evidenceLevel: "direct_feature_evidence",
    }),
    true
  );
  assert.equal(
    isGeneratedHistoricalMisuse({
      generated: true,
      evidenceLevel: "conceptual_only",
    }),
    false
  );
});

test("unresolved decisions fall back to placeholder", () => {
  const out = productionImageFromDecision([real], {
    featureId: "f1",
    status: "needs-review",
    primaryCandidate: "c1",
  });
  assert.equal(out.image, null);
  assert.equal(out.reason, "unresolved");
});

test("at most three candidates are kept per feature", () => {
  const many = [1, 2, 3, 4, 5].map((n) => ({
    candidateId: `c${n}`,
    sourceType: "community",
    confidence: "low",
  }));
  assert.equal(capCandidates(many).length, 3);
});

test("unconfigured image agent does not fake success", async () => {
  const img = await findCandidates({ featureId: "x" });
  assert.equal(img.state, "not-configured");
  assert.equal(img.candidates.length, 0);
});

test("Glean Chat stays unused without credentials", () => {
  assert.equal(gleanChatConfigured(), false);
  assert.equal(recommendationAgentStatus(), "local");
});

test("Glean button returns local review recommendations without Glean credentials", async () => {
  const rec = await recommend({
    featureId: "camera-preview",
    feature: {
      title: "Camera Preview",
      evidenceConfidence: "low",
      reviewPriority: "high",
      sopOta: "OTA",
      category: "Camera",
      hasImage: false,
      missingEvidence: ["image", "source_url"],
      reasons: ["No valid source URL (−18)", "No reliable image evidence (−10)"],
    },
  });
  assert.equal(rec.ok, true);
  assert.equal(rec.state, "success");
  assert.equal(rec.agent, "local-review");
  assert.match(rec.message, /Engineering follow-up recommended/);
  assert.match(rec.message, /Camera Preview/);
  assert.match(rec.message, /Image Review/);
  assert.doesNotMatch(rec.message, /Agent not configured/i);
});
