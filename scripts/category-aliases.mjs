/**
 * Tesla legacy tag labels → canonical category names.
 * Name-only: never moves a feature into a different category area.
 * Rivian uses a separate canonical list and must not use these aliases.
 */
export const TESLA_CATEGORY_ALIASES = {
  FSD: "Autopilot / Full Self-Driving",
  "Driver Profile": "Profile",
  Charging: "Range / Charging / Energy",
  "Map / Navigation / Trip": "Map / Navigation / Trip / Route",
};

const TESLA_ALIAS_LOOKUP = new Map();
for (const [from, to] of Object.entries(TESLA_CATEGORY_ALIASES)) {
  TESLA_ALIAS_LOOKUP.set(from, to);
  TESLA_ALIAS_LOOKUP.set(from.toLowerCase(), to);
}

export function canonicalTeslaCategoryName(name) {
  if (typeof name !== "string") return name;
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return (
    TESLA_CATEGORY_ALIASES[trimmed] ||
    TESLA_ALIAS_LOOKUP.get(trimmed.toLowerCase()) ||
    trimmed
  );
}

export function normalizeTeslaCategories(cats) {
  const out = [];
  const seen = new Set();
  for (const c of cats || []) {
    const next = canonicalTeslaCategoryName(c);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

export function normalizeTeslaFeatureTags(feature) {
  if (!feature || typeof feature !== "object") return feature;
  const categories = normalizeTeslaCategories(feature.categories);
  const renamedPrimary = canonicalTeslaCategoryName(feature.primaryCategory);
  const next = {
    ...feature,
    categories,
    primaryCategory: categories.includes(renamedPrimary)
      ? renamedPrimary
      : categories[0] || renamedPrimary || null,
  };
  if (Array.isArray(feature.categoriesAuto)) {
    next.categoriesAuto = normalizeTeslaCategories(feature.categoriesAuto);
  }
  if (feature.primaryCategoryAuto) {
    const auto = next.categoriesAuto || [];
    const p = canonicalTeslaCategoryName(feature.primaryCategoryAuto);
    next.primaryCategoryAuto = auto.includes(p) ? p : auto[0] || p;
  }
  return next;
}

export function teslaCategoriesChanged(before, after) {
  const a = before || [];
  const b = after || [];
  if (a.length !== b.length) return true;
  return a.some((c, i) => c !== b[i]);
}
