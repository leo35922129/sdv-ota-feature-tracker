/**
 * Deterministic evidence-confidence scoring from canonical feature fields.
 * Does not mutate release notes. Output is a review estimate, not a verdict
 * that the historical feature is true or false.
 */

const APPROX_DATE =
  /\b(approx|approximately|around|circa|estimated|owner[- ]reported)\b/i;
const CAVEAT =
  /\b(optional|beta|preview|region[- ]dependent|hardware[- ]dependent|subscription|premium connectivity|subject to|limited to)\b/i;
const OFFICIAL_HOST =
  /(notateslaapp\.com|tesla\.com|teslacdn\.com|rivian\.com|rivianwave\.com)\b/i;
const MEDIA_HOST = /(electrek\.co|theverge\.com|insideevs\.com|teslarati\.com)\b/i;
const COMMUNITY_HOST =
  /(reddit\.com|teslamotorsclub\.com|forums\.|facebook\.com)\b/i;

export function isValidHttpUrl(value) {
  try {
    const u = new URL(String(value || ""));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function inferSourceQuality(feature) {
  const source = String(feature?.source || "").toLowerCase();
  const url = String(feature?.releaseUrl || feature?.links?.[0]?.url || "");
  const desc = `${feature?.title || ""} ${feature?.description || ""}`;
  if (source === "electrek" || MEDIA_HOST.test(url)) return "professional_media";
  if (
    source === "tesla-model-3-2017-2019" ||
    source === "tesla-model-s-x-2012-2019"
  ) {
    return APPROX_DATE.test(desc) || /owner[- ]reported/i.test(desc)
      ? "owner_reported"
      : "manual";
  }
  if (feature?.type === "official" || OFFICIAL_HOST.test(url)) return "official";
  if (COMMUNITY_HOST.test(url)) return "community";
  if (source) return "unknown";
  return url ? "official" : "unknown";
}

export function inferSopOta(feature) {
  const version = String(feature?.version || "");
  const type = String(feature?.type || "").toLowerCase();
  if (/^sop\b/i.test(version) || type === "sop") return "SOP";
  if (type === "historical") return "OTA";
  return "OTA";
}

export function hasUsefulImage(feature) {
  const url = String(feature?.image || "");
  if (!url) return false;
  if (/placeholder|rivian-wave-placeholder/i.test(url)) return false;
  return true;
}

function qualityScore(quality) {
  switch (quality) {
    case "official":
      return 16;
    case "professional_media":
      return 8;
    case "manual":
      return 4;
    case "community":
      return -8;
    case "owner_reported":
      return -10;
    default:
      return 0;
  }
}

/**
 * @returns {{
 *   evidenceConfidence: 'high'|'medium'|'low',
 *   reviewPriority: 'high'|'medium'|'low',
 *   reasons: string[],
 *   missingEvidence: string[],
 *   sourceQuality: string,
 *   score: number,
 *   sopOta: 'SOP'|'OTA',
 *   hasImage: boolean
 * }}
 */
export function scoreFeature(feature) {
  const reasons = [];
  const missingEvidence = [];
  let score = 58;
  const quality = inferSourceQuality(feature);
  const sopOta = inferSopOta(feature);
  const desc = String(feature?.description || "").trim();
  const version = String(feature?.version || "").trim();
  const date = String(feature?.releaseDate || "").trim();
  const sourceUrl =
    feature?.releaseUrl ||
    feature?.links?.find((l) => isValidHttpUrl(l?.url))?.url ||
    "";
  const hasImage = hasUsefulImage(feature);

  const qDelta = qualityScore(quality);
  score += qDelta;
  reasons.push(`Source quality: ${quality} (${qDelta >= 0 ? "+" : ""}${qDelta})`);

  if (isValidHttpUrl(sourceUrl)) {
    score += 12;
    reasons.push("Source URL is present and valid (+12)");
  } else {
    score -= 18;
    missingEvidence.push("source_url");
    reasons.push("No valid source URL (−18)");
  }

  if (/^\d+(\.\d+)+$/.test(version) || /^v?\d+/i.test(version)) {
    score += 6;
    reasons.push("Version looks specific (+6)");
  } else if (!version) {
    score -= 8;
    missingEvidence.push("version");
    reasons.push("Missing version (−8)");
  }

  if (date && !APPROX_DATE.test(date) && !APPROX_DATE.test(desc)) {
    score += 6;
    reasons.push("Release date is not marked approximate (+6)");
  } else if (APPROX_DATE.test(date) || APPROX_DATE.test(desc)) {
    score -= 8;
    reasons.push("Date or notes use approximate language (−8)");
  } else {
    missingEvidence.push("release_date");
    score -= 6;
    reasons.push("Release date missing (−6)");
  }

  if ((feature?.models || []).length) {
    score += 6;
    reasons.push("Model coverage is listed (+6)");
  } else {
    score -= 8;
    missingEvidence.push("models");
    reasons.push("Model applicability is unclear (−8)");
  }

  if (desc.length >= 80) {
    score += 8;
    reasons.push("Release-note detail is substantial (+8)");
  } else if (desc.length >= 24) {
    score += 2;
    reasons.push("Release-note detail is brief (+2)");
  } else {
    score -= 12;
    missingEvidence.push("description");
    reasons.push("Release-note detail is thin (−12)");
  }

  if (CAVEAT.test(desc) || CAVEAT.test(feature?.availability || "")) {
    score -= 4;
    reasons.push("Caveats (beta/optional/region/hardware/subscription) (−4)");
  }

  if (hasImage) {
    score += 10;
    reasons.push("Direct image evidence is present (+10)");
  } else {
    score -= 10;
    missingEvidence.push("image");
    reasons.push("No reliable image evidence (−10)");
  }

  score = Math.max(0, Math.min(100, score));
  const evidenceConfidence = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  let reviewPriority = "low";
  if (evidenceConfidence === "low" || (!hasImage && evidenceConfidence !== "high")) {
    reviewPriority = "high";
  } else if (evidenceConfidence === "medium") {
    reviewPriority = "medium";
  }

  return {
    evidenceConfidence,
    reviewPriority,
    reasons,
    missingEvidence,
    sourceQuality: quality,
    score,
    sopOta,
    hasImage,
  };
}

export function compareReviewRows(a, b) {
  const prio = { high: 0, medium: 1, low: 2 };
  const conf = { low: 0, medium: 1, high: 2 };
  const pd = prio[a.reviewPriority] - prio[b.reviewPriority];
  if (pd !== 0) return pd;
  const cd = conf[a.evidenceConfidence] - conf[b.evidenceConfidence];
  if (cd !== 0) return cd;
  return String(a.title || "").localeCompare(String(b.title || ""));
}

export function summarizeReview(rows) {
  const summary = {
    evaluated: rows.length,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    highPriority: 0,
    missingImage: 0,
    sourceConcerns: 0,
  };
  for (const row of rows) {
    if (row.evidenceConfidence === "high") summary.highConfidence++;
    else if (row.evidenceConfidence === "medium") summary.mediumConfidence++;
    else summary.lowConfidence++;
    if (row.reviewPriority === "high") summary.highPriority++;
    if (!row.hasImage) summary.missingImage++;
    if (
      row.sourceQuality === "unknown" ||
      row.sourceQuality === "community" ||
      row.sourceQuality === "owner_reported" ||
      (row.missingEvidence || []).includes("source_url")
    ) {
      summary.sourceConcerns++;
    }
  }
  return summary;
}
