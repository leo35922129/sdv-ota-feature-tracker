/**
 * Tesla promotional intro cards that should not become feature cards.
 */
export function isExcludedTeslaFeature(feature = {}) {
  const title = String(feature.title || "").trim();
  const description = String(feature.description || "");
  const id = String(feature.id || "");
  if (/^summer update$/i.test(title) && /swipe up to see your new features/i.test(description)) {
    return true;
  }
  if (/summer-update/i.test(id) && /^summer update$/i.test(title)) return true;
  return false;
}

export function withoutExcludedTeslaFeatures(features) {
  return (features || []).filter((f) => !isExcludedTeslaFeature(f));
}
