/**
 * Pure helpers for OTA chart bar drill-down detail lists.
 * Shared by app.js and unit tests — keeps chart counts and detail rows consistent.
 */

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function yearFromRelease(releaseDate, version) {
  const fromDate = String(releaseDate || "").match(/\b(20\d{2})\b/);
  if (fromDate) return Number(fromDate[1]);
  const fromVersion = String(version || "").match(/^(20\d{2})\b/);
  if (fromVersion) return Number(fromVersion[1]);
  return null;
}

/**
 * Category dropdown / list order: most OTAs first, least last.
 * Ties keep a stable A–Z name. Does not drop zero-count categories.
 */
export function categoriesSortedByOtaCount(categories, counts = {}) {
  return [...(categories || [])].sort((a, b) => {
    const diff = (counts[b] ?? 0) - (counts[a] ?? 0);
    if (diff !== 0) return diff;
    return String(a).localeCompare(String(b));
  });
}

export function monthFromRelease(releaseDate) {
  // Prefer calendar components from ISO date strings to avoid UTC offset shifting the month
  const iso = String(releaseDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Number(iso[2]) - 1;
  const local = new Date(releaseDate);
  if (Number.isNaN(local.getTime())) return null;
  return local.getMonth();
}

function releaseInYear(release, year) {
  if (year === "all" || year == null || year === "") return true;
  return yearFromRelease(release.releaseDate, release.version) === Number(year);
}

function matchesQuery(group, q) {
  if (!q) return true;
  const releaseHay = (group.releases || [])
    .map((r) => `${r.version} ${r.releaseDate || ""}`)
    .join(" ");
  const hay =
    `${group.title} ${group.description || ""} ${(group.categories || []).join(" ")} ${releaseHay}`.toLowerCase();
  return hay.includes(q);
}

/**
 * Resolve effective detail scope from bar drill + active filters.
 * Filters win when set; bar drill supplies category/year/month when filters are "all".
 */
export function resolveDetailScope(drill, filters = {}) {
  const categoryFilter = filters.category ?? "all";
  const yearFilter = filters.year ?? "all";
  const versionFilter = filters.version ?? "all";
  const search = (filters.search || "").trim().toLowerCase();

  const category =
    categoryFilter !== "all"
      ? categoryFilter
      : drill?.category || null;

  let year = yearFilter !== "all" ? String(yearFilter) : "all";
  if (year === "all" && drill?.year != null && drill.year !== "all") {
    year = String(drill.year);
  }

  let month = null;
  if (drill?.month != null && drill.month !== "" && year !== "all") {
    month = Number(drill.month);
    if (!Number.isInteger(month) || month < 0 || month > 11) month = null;
  }

  return {
    category,
    year,
    month,
    version: versionFilter,
    search,
    barLabel: drill?.barLabel || category || (year !== "all" ? String(year) : "Details"),
  };
}

/**
 * Collect feature×OTA rows for a chart bar drill-down.
 * Uses group.featureIds (stable IDs) and group.title (feature-card title).
 * One row per (feature group, OTA release) that matches scope — mirrors chart
 * membership (category + dated release) while applying version/search filters.
 */
export function collectChartDetailRows(groups, scope) {
  const rows = [];
  if (!scope?.category && scope?.category !== 0) {
    // category required for meaningful bar mapping (charts are category- or year-scoped)
  }
  const needCategory = Boolean(scope.category);

  for (const g of groups || []) {
    if (needCategory && !(g.categories || []).includes(scope.category)) continue;
    if (!matchesQuery(g, scope.search)) continue;

    for (const r of g.releases || []) {
      if (!releaseInYear(r, scope.year)) continue;
      if (scope.version !== "all" && r.version !== scope.version) continue;

      const y = yearFromRelease(r.releaseDate, r.version);
      if (y == null) continue;
      const m = monthFromRelease(r.releaseDate);
      if (scope.month != null) {
        if (m == null || m !== scope.month) continue;
      }

      const featureId =
        (g.featureIds && g.featureIds[0]) ||
        g.id ||
        `${g.title}::${r.version}`;

      rows.push({
        featureId,
        featureIds: [...(g.featureIds || [])],
        title: g.title,
        description: g.description || "",
        categories: [...(g.categories || [])],
        version: r.version,
        releaseDate: r.releaseDate || null,
        releaseUrl: r.releaseUrl || null,
        year: y,
        month: m,
      });
    }
  }

  rows.sort((a, b) => {
    // Newest first
    if (a.year !== b.year) return b.year - a.year;
    const ma = a.month == null ? -1 : a.month;
    const mb = b.month == null ? -1 : b.month;
    if (ma !== mb) return mb - ma;
    const da = String(a.releaseDate || "");
    const db = String(b.releaseDate || "");
    if (da !== db) return db.localeCompare(da);
    if (a.version !== b.version) return String(b.version).localeCompare(String(a.version));
    return a.title.localeCompare(b.title);
  });

  return rows;
}

/**
 * Group rows for display.
 * Specific year → by month (newest month first).
 * All years → by year then month (newest first).
 */
export function groupChartDetailRows(rows, { year } = {}) {
  const allYears = year === "all";
  const byYear = new Map();

  for (const row of rows) {
    const y = row.year;
    if (!byYear.has(y)) byYear.set(y, new Map());
    const byMonth = byYear.get(y);
    const mKey = row.month == null ? "unknown" : row.month;
    if (!byMonth.has(mKey)) byMonth.set(mKey, []);
    byMonth.get(mKey).push(row);
  }

  const years = [...byYear.keys()].sort((a, b) => b - a);
  const result = [];

  for (const y of years) {
    const byMonth = byYear.get(y);
    const monthKeys = [...byMonth.keys()].sort((a, b) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return b - a;
    });

    const months = monthKeys.map((mKey) => {
      const monthRows = byMonth.get(mKey);
      // Group by OTA version within month for clear multi-OTA features
      const byOta = new Map();
      for (const row of monthRows) {
        const key = `${row.version}||${row.releaseDate || ""}`;
        if (!byOta.has(key)) {
          byOta.set(key, {
            version: row.version,
            releaseDate: row.releaseDate,
            releaseUrl: row.releaseUrl,
            features: [],
          });
        }
        const bucket = byOta.get(key);
        // Dedupe same feature title within one OTA
        if (!bucket.features.some((f) => f.featureId === row.featureId || f.title === row.title)) {
          bucket.features.push({
            featureId: row.featureId,
            featureIds: row.featureIds,
            title: row.title,
            categories: row.categories,
            description: row.description || "",
          });
        }
      }
      const otas = [...byOta.values()].sort((a, b) => {
        const da = String(a.releaseDate || "");
        const db = String(b.releaseDate || "");
        if (da !== db) return db.localeCompare(da);
        return String(b.version).localeCompare(String(a.version));
      });
      for (const ota of otas) {
        ota.features.sort((a, b) => a.title.localeCompare(b.title));
      }
      return {
        month: mKey === "unknown" ? null : mKey,
        monthLabel: mKey === "unknown" ? "Date unknown" : MONTH_LABELS[mKey],
        otas,
      };
    });

    result.push({ year: y, months });
  }

  if (!allYears && result.length === 1) {
    return {
      mode: "year",
      year: result[0].year,
      months: result[0].months,
      years: result,
    };
  }

  return {
    mode: allYears || result.length > 1 ? "all-years" : "year",
    year: allYears ? "all" : result[0]?.year ?? null,
    months: result.length === 1 ? result[0].months : null,
    years: result,
  };
}

/**
 * Flatten year/month grouping into one month-section list.
 * All-years and single-year views share this shape so list UI stays identical:
 * heading "Aug 2026", then the same row fields (title, intro, version, date).
 */
export function flattenDetailMonths(grouped) {
  if (!grouped) return [];

  const fromYears = (grouped.years || []).flatMap((yBlock) =>
    (yBlock.months || []).map((m) => ({
      month: m.month,
      monthLabel: m.monthLabel,
      year: yBlock.year,
      otas: m.otas || [],
      features: m.features || [],
      headingLabel:
        m.month == null || yBlock.year == null
          ? m.monthLabel || "Date unknown"
          : `${m.monthLabel} ${yBlock.year}`,
    }))
  );
  if (fromYears.length) return fromYears;

  const fallbackYear =
    grouped.year != null && grouped.year !== "all" ? grouped.year : null;
  return (grouped.months || []).map((m) => ({
    month: m.month,
    monthLabel: m.monthLabel,
    year: fallbackYear,
    otas: m.otas || [],
    features: m.features || [],
    headingLabel:
      m.month == null || fallbackYear == null
        ? m.monthLabel || "Date unknown"
        : `${m.monthLabel} ${fallbackYear}`,
  }));
}

/**
 * Stable identity for list/card dedupe — same title+description (or shared IDs)
 * collapse to one feature, matching feature-card grouping.
 */
export function featureIdentityKey(row) {
  const ids =
    Array.isArray(row?.featureIds) && row.featureIds.length
      ? [...row.featureIds].map(String).sort()
      : null;
  if (ids?.length) return `id:${ids.join("|")}`;
  return `td:${row?.title ?? ""}\n${row?.description ?? ""}`;
}

/**
 * Collapse OTA×feature detail rows into unique features with multi-release lists.
 * One feature per card identity; releases sorted newest-first.
 */
export function collapseDetailRowsToFeatures(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = featureIdentityKey(row);
    let feat = map.get(key);
    if (!feat) {
      feat = {
        featureId: row.featureId,
        featureIds: [...(row.featureIds || [])],
        title: row.title,
        description: row.description || "",
        categories: [...(row.categories || [])],
        releases: [],
      };
      map.set(key, feat);
    } else {
      for (const id of row.featureIds || []) {
        if (!feat.featureIds.includes(id)) feat.featureIds.push(id);
      }
    }
    const already = feat.releases.some((r) => r.version === row.version);
    if (!already) {
      feat.releases.push({
        version: row.version,
        releaseDate: row.releaseDate || null,
        releaseUrl: row.releaseUrl || null,
        year: row.year,
        month: row.month,
      });
    }
  }

  for (const feat of map.values()) {
    feat.releases.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      const ma = a.month == null ? -1 : a.month;
      const mb = b.month == null ? -1 : b.month;
      if (ma !== mb) return mb - ma;
      const da = String(a.releaseDate || "");
      const db = String(b.releaseDate || "");
      if (da !== db) return db.localeCompare(da);
      return String(b.version).localeCompare(String(a.version), undefined, {
        numeric: true,
      });
    });
  }

  return [...map.values()].sort((a, b) => {
    const ra = a.releases[0];
    const rb = b.releases[0];
    if (!ra && !rb) return a.title.localeCompare(b.title);
    if (!ra) return 1;
    if (!rb) return -1;
    if (ra.year !== rb.year) return rb.year - ra.year;
    const ma = ra.month == null ? -1 : ra.month;
    const mb = rb.month == null ? -1 : rb.month;
    if (ma !== mb) return mb - ma;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Place each unique feature under the month of its newest in-scope release.
 * Same month-section chrome as the OTA-expanded list, but one row per feature.
 */
export function groupDetailFeaturesByMonth(features, { year } = {}) {
  const allYears = year === "all";
  const byYear = new Map();

  for (const feat of features || []) {
    const newest = feat.releases?.[0];
    if (!newest) continue;
    const y = newest.year;
    const mKey = newest.month == null ? "unknown" : newest.month;
    if (!byYear.has(y)) byYear.set(y, new Map());
    const byMonth = byYear.get(y);
    if (!byMonth.has(mKey)) byMonth.set(mKey, []);
    byMonth.get(mKey).push(feat);
  }

  const years = [...byYear.keys()].sort((a, b) => b - a);
  const result = [];

  for (const y of years) {
    const byMonth = byYear.get(y);
    const monthKeys = [...byMonth.keys()].sort((a, b) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return b - a;
    });
    const months = monthKeys.map((mKey) => {
      const list = byMonth.get(mKey);
      return {
        month: mKey === "unknown" ? null : mKey,
        monthLabel: mKey === "unknown" ? "Date unknown" : MONTH_LABELS[mKey],
        features: list,
        otas: [],
      };
    });
    result.push({ year: y, months });
  }

  if (!allYears && result.length === 1) {
    return {
      mode: "year",
      year: result[0].year,
      months: result[0].months,
      years: result,
    };
  }

  return {
    mode: allYears || result.length > 1 ? "all-years" : "year",
    year: allYears ? "all" : result[0]?.year ?? null,
    months: result.length === 1 ? result[0].months : null,
    years: result,
  };
}

export function countDetailStats(rows) {
  const otas = new Set(rows.map((r) => r.version));
  const features = new Set(rows.map((r) => featureIdentityKey(r)));
  return {
    otaCount: otas.size,
    featureCount: features.size,
    rowCount: rows.length,
  };
}

/** Stable feature IDs represented in detail rows (List layout source). */
export function featureIdsFromDetailRows(rows) {
  const ids = new Set();
  for (const r of rows || []) {
    const list =
      Array.isArray(r.featureIds) && r.featureIds.length
        ? r.featureIds
        : r.featureId != null
          ? [r.featureId]
          : [];
    for (const id of list) ids.add(id);
  }
  return ids;
}

/**
 * Narrow card groups to the same features as List detail rows.
 * Preserves the caller's group order (filteredGroups sort order).
 */
export function filterGroupsByFeatureIds(groups, featureIds) {
  const set =
    featureIds instanceof Set ? featureIds : new Set(featureIds || []);
  if (!set.size) return [];
  return (groups || []).filter((g) =>
    (g.featureIds || []).some((id) => set.has(id))
  );
}

/**
 * Shared view-model for List + Cards in chart drill-down.
 * One collect pass; both layouts derive from the same rows / feature IDs.
 * List uses featureGrouped (one row per unique feature, multi-release dropdown).
 */
export function buildDetailViewModel(groups, drill, filters = {}) {
  const scope = resolveDetailScope(drill, filters);
  const rows = collectChartDetailRows(groups, scope);
  const featureIds = featureIdsFromDetailRows(rows);
  const grouped = groupChartDetailRows(rows, { year: scope.year });
  const features = collapseDetailRowsToFeatures(rows);
  const featureGrouped = groupDetailFeaturesByMonth(features, {
    year: scope.year,
  });
  const stats = countDetailStats(rows);
  return {
    scope,
    rows,
    grouped,
    features,
    featureGrouped,
    featureIds,
    stats,
  };
}

/** Short intro for list layout — same source text as feature-card description. */
export function shortFeatureIntro(description, maxLen = 160) {
  const text = String(description || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const sentence = text.match(/^[\s\S]{1,160}?[.!?](?=\s|$)/);
  if (sentence && sentence[0].length >= 24) {
    return sentence[0].trim();
  }
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const tidy = cut.replace(/\s+\S*$/, "");
  return `${tidy || cut}…`;
}

/**
 * Unique OTA versions for a category in a year — same semantics as chart bars.
 */
export function uniqueOtaVersionsForCategoryYear(groups, category, year) {
  const set = new Set();
  for (const g of groups || []) {
    if (category && category !== "all" && !(g.categories || []).includes(category)) {
      continue;
    }
    for (const r of g.releases || []) {
      if (!releaseInYear(r, year)) continue;
      if (yearFromRelease(r.releaseDate, r.version) == null) continue;
      set.add(r.version);
    }
  }
  return set;
}
