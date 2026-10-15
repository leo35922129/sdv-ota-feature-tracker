/**
 * Image review decision rules. Production cards only receive approved
 * candidates via feature-edits overlay — never by mutating releases.json.
 */
export const MAX_CANDIDATES_PER_FEATURE = 3;

const SOURCE_RANK = {
  official: 0,
  manual: 1,
  professional_media: 2,
  community: 3,
  forum: 4,
  video_frame: 5,
  generated: 6,
  placeholder: 7,
};

export function isGeneratedHistoricalMisuse(candidate) {
  return Boolean(candidate?.generated) && candidate?.evidenceLevel !== "conceptual_only";
}

export function candidateAllowedOnProduction(candidate, decision) {
  if (!candidate || !decision) return false;
  if (decision.status !== "approved") return false;
  if (candidate.reviewStatus === "rejected") return false;
  if (candidate.generated) return false;
  if (candidate.sourceType === "placeholder" || candidate.sourceType === "generated") {
    return false;
  }
  if (
    candidate.licenseStatus &&
    /unlicensed|unknown|forbidden/i.test(candidate.licenseStatus)
  ) {
    return false;
  }
  const chosen = [decision.primaryCandidate, decision.secondaryCandidate];
  return chosen.includes(candidate.candidateId);
}

export function productionImageFromDecision(candidates, decision) {
  if (!decision || decision.status === "placeholder" || decision.status === "rejected") {
    return { image: null, imageDark: null, reason: "placeholder" };
  }
  if (decision.status !== "approved") {
    return { image: null, imageDark: null, reason: "unresolved" };
  }
  const byId = new Map((candidates || []).map((c) => [c.candidateId, c]));
  const primary = byId.get(decision.primaryCandidate);
  const secondary = byId.get(decision.secondaryCandidate);
  const primaryOk = candidateAllowedOnProduction(primary, decision);
  const secondaryOk = candidateAllowedOnProduction(secondary, decision);
  return {
    image: primaryOk ? primary.imageUrl || primary.imagePath || null : null,
    imageDark: secondaryOk ? secondary.imageUrl || secondary.imagePath || null : null,
    reason: primaryOk ? "approved" : "placeholder",
  };
}

export function sortCandidates(candidates = []) {
  return [...candidates].sort((a, b) => {
    const ra = SOURCE_RANK[a.sourceType] ?? 9;
    const rb = SOURCE_RANK[b.sourceType] ?? 9;
    if (ra !== rb) return ra - rb;
    const conf = { high: 0, medium: 1, low: 2 };
    return (conf[a.confidence] ?? 3) - (conf[b.confidence] ?? 3);
  });
}

export function capCandidates(candidates = []) {
  return sortCandidates(candidates).slice(0, MAX_CANDIDATES_PER_FEATURE);
}

export function makePlaceholderDecision(featureId, reviewer) {
  return {
    featureId,
    status: "placeholder",
    reviewer,
    reviewedAt: new Date().toISOString(),
  };
}

export function compareImageReviewItems(a, b, sort) {
  if (sort === "name") return String(a.title).localeCompare(String(b.title));
  if (sort === "category") {
    return String(a.category || "").localeCompare(String(b.category || ""));
  }
  if (sort === "confidence") {
    const conf = { low: 0, medium: 1, high: 2 };
    return (conf[a.evidenceConfidence] ?? 3) - (conf[b.evidenceConfidence] ?? 3);
  }
  const statusRank = (item) => {
    const st = item.decision?.status || "needs-review";
    if (st === "needs-review" || !item.decision) return 0;
    if (st === "placeholder") return 1;
    if (st === "rejected") return 2;
    return 3;
  };
  const sd = statusRank(a) - statusRank(b);
  if (sd !== 0) return sd;
  return String(a.title).localeCompare(String(b.title));
}
