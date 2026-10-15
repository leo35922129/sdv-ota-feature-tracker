/**
 * Manual tag lock: once a user saves category tags, automatic rules
 * must not add, remove, or union extra tags onto that feature.
 */

export const MANUAL_CATEGORY_SOURCES = new Set([
  "manual_override",
  "category_override",
  "override",
]);

export function isManualCategoryLock(feature) {
  return MANUAL_CATEGORY_SOURCES.has(feature?.categorySource);
}

export function featureIdentityKey(feature) {
  return `${feature?.title || ""}\n${feature?.description ?? ""}`;
}

export function protectedIdentityKeys(features, protectionIds) {
  const keys = new Set();
  const ids = protectionIds instanceof Set ? protectionIds : new Set(protectionIds || []);
  for (const f of features || []) {
    if (f?.id && ids.has(f.id)) keys.add(featureIdentityKey(f));
  }
  return keys;
}

/**
 * Copy saved manual tags onto later OTA copies of the same feature
 * (same name + description) so scrape/recategorize cannot grow the tag set.
 */
export function inheritManualCategoriesByFeatureKey(features) {
  const lockByKey = new Map();
  for (const f of features || []) {
    if (!isManualCategoryLock(f) || !Array.isArray(f.categories) || !f.categories.length) {
      continue;
    }
    const key = featureIdentityKey(f);
    if (!lockByKey.has(key)) {
      lockByKey.set(key, {
        categories: [...f.categories],
        categorySource: f.categorySource,
      });
    }
  }
  if (!lockByKey.size) return features || [];

  return (features || []).map((f) => {
    if (isManualCategoryLock(f)) return f;
    const lock = lockByKey.get(featureIdentityKey(f));
    if (!lock) return f;
    return {
      ...f,
      categories: [...lock.categories],
      primaryCategory: lock.categories[0] || f.primaryCategory,
      categorySource: lock.categorySource,
      categoriesInherited: true,
      categoriesAuto: f.categoriesAuto || [...(f.categories || [])],
    };
  });
}

/**
 * Copy a saved image overlay onto later OTA copies of the same feature
 * (same name + description) so a scrape cannot drop a manual upload.
 */
export function inheritEditedImagesByFeatureKey(features) {
  const imageByKey = new Map();
  for (const f of features || []) {
    if (!f?.featureEdited) continue;
    const key = featureIdentityKey(f);
    if (imageByKey.has(key)) continue;
    if (f.image || f.imageDark) {
      imageByKey.set(key, {
        image: f.image,
        imageDark: f.imageDark,
      });
    }
  }
  if (!imageByKey.size) return features || [];

  return (features || []).map((f) => {
    if (f?.featureEdited) return f;
    const inherited = imageByKey.get(featureIdentityKey(f));
    if (!inherited) return f;
    return {
      ...f,
      image: inherited.image !== undefined ? inherited.image : f.image,
      imageDark:
        inherited.imageDark !== undefined ? inherited.imageDark : f.imageDark,
      imageInherited: true,
    };
  });
}

/**
 * When collapsing OTA copies into one card, never union automatic tags
 * onto a feature the user already tagged by hand.
 */
export function mergeGroupCategories(group, feature) {
  const incomingManual = isManualCategoryLock(feature);
  const groupLocked = Boolean(group?.categoriesLocked) || isManualCategoryLock(group);

  if (incomingManual) {
    if (!groupLocked) {
      group.categories = [...(feature.categories || [])];
      group.categorySource = feature.categorySource;
      group.categoriesLocked = true;
    }
    return group;
  }

  if (groupLocked) return group;

  for (const c of feature.categories || []) {
    if (!group.categories.includes(c)) group.categories.push(c);
  }
  return group;
}
