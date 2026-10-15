import {
  MONTH_LABELS,
  yearFromRelease as yearFromReleaseShared,
  monthFromRelease,
  shortFeatureIntro,
  buildDetailViewModel,
  filterGroupsByFeatureIds,
  flattenDetailMonths,
  collapseDetailRowsToFeatures,
  categoriesSortedByOtaCount,
} from "./scripts/chart-detail.mjs";
import { normalizeTeslaFeatureTags } from "./scripts/category-aliases.mjs";
import {
  rankSearchResults,
  highlightSearchHtml,
} from "./scripts/search-results.mjs";
import {
  isManualCategoryLock,
  inheritManualCategoriesByFeatureKey,
  inheritEditedImagesByFeatureKey,
  mergeGroupCategories,
} from "./scripts/manual-category-lock.mjs";
import {
  moveTagRelative,
  dropBeforeFromPoint,
  nearestChipFromPoint,
  chipMetrics,
} from "./scripts/edit-tags.mjs";
import {
  explainEditFailure,
  setInputValue,
} from "./scripts/edit-errors.mjs";
import { featureGroupKey } from "./scripts/electrek-sx-dedupe.mjs";
import {
  fetchAdminSession,
  loginAdminMock,
  logoutAdmin,
  fetchAdminOverlays,
  postAdminDecision,
  postAdminRecommend,
  postAdminImageSearch,
  postAdminImageGenerate,
  fetchAdminHistory,
  fetchAdminUsage,
  postAdminHistoryRestore,
  postAdminHistoryBackup,
} from "./scripts/admin-client.mjs";
import { scoreFeature } from "./scripts/feature-review.mjs";
import {
  renderDevelopmentReportHtml,
  renderImageReviewHtml,
  renderDevelopmentHistoryHtml,
  renderDevelopmentTimeHtml,
  renderTokenUsageHtml,
} from "./scripts/admin-workspace.mjs?v=20261002-drs133";
import {
  filterGroupsByModel,
  isValidVehicleModel,
  vehicleModelLabel,
  vehicleModelOptionsForBrand,
} from "./scripts/vehicle-model-filter.mjs";
import {
  SORP_CATEGORIES,
  groupMilestonesByYear,
  groupOverviewMilestones,
  modelMilestoneData,
  sorpRowsForCategory,
  allModelsOverview,
} from "./scripts/tesla-milestones.mjs?v=20261012-drs192";
import {
  loadSimulatorDraft,
  saveSimulatorDraft,
  draftToState,
  computeSimulatorMetrics,
  renderDigitalRevenueSimulatorHtml,
  patchDigitalRevenueOutputs,
  appendYear,
  appendFeature,
  removeYear,
  removeFeature,
  isBuiltInFeature,
  isDefaultYear,
  normalizeDraft,
  defaultSimulatorDraft,
  DRS_MAX_YEARS,
} from "./scripts/digital-revenue-simulator.mjs?v=20261010-drs183";

const modelSelect = document.getElementById("model");
const categorySelect = document.getElementById("category");
const yearSelect = document.getElementById("year");
const versionSelect = document.getElementById("version");
const searchInput = document.getElementById("search");
const resultsEl = document.getElementById("results");
const resultMeta = document.getElementById("resultMeta");
const statsEl = document.getElementById("stats");
const chartPanel = document.getElementById("chartPanel");
const chartTitle = document.getElementById("chartTitle");
const chartSubtitle = document.getElementById("chartSubtitle");
const chartTotal = document.getElementById("chartTotal");
const chartHeaderActions = document.getElementById("chartHeaderActions");
const chartWrap = document.getElementById("chartWrap");
const chartModeBar = document.getElementById("chartModeBar");
const footerSource = document.getElementById("footerSource");
const sourceSyncEl = document.getElementById("sourceSync");
const lastUpdatedEl = document.getElementById("lastUpdated");
const cardBackdrop = document.getElementById("cardBackdrop");
const featureDetailHost = document.getElementById("featureDetailHost");
const adminAuthHost = document.getElementById("adminAuthHost");
const workspaceModeHost = document.getElementById("workspaceModeHost");
const adminDialogHost = document.getElementById("adminDialogHost");
const brandButtons = [...document.querySelectorAll(".brand-btn")];
const heroShell = document.querySelector(".hero-shell");
const heroShellPhoto = document.querySelector(".hero-shell-photo");

const HERO_IMAGES = {
  tesla: "./assets/tesla-hero-bg.png",
  rivian: "./assets/rivian-hero-bg.png?v=4",
};

function updateHeroPhoto(nextBrand) {
  if (!heroShellPhoto) return;
  const src = HERO_IMAGES[nextBrand] || HERO_IMAGES.tesla;
  if (heroShellPhoto.getAttribute("src") !== src) {
    heroShellPhoto.setAttribute("src", src);
  }
}

/** @type {null | { category?: string, year?: string|number, month?: number, barLabel?: string }} */
let chartDrill = null;
let chartDetailStatus = "idle"; // idle | loading | ready | empty | error
let chartDetailError = null;
/** @type {"list" | "cards"} — Cards is the original/default feature presentation. */
let detailLayout = "cards";
/** @type {"frequency" | "milestone" | "revenue-simulator"} */
let chartView = "frequency";
let sorpCategoryId = "vehicle-packaging";
let teslaMilestonesDoc = null;
let digitalRevenueDraft = loadSimulatorDraft();
let drsSimulatorBound = false;
/** @type {null | { ox: number, oy: number }} */
let pendingChartZoom = null;

const BRAND_META = {
  tesla: {
    label: "Tesla",
    dataUrl: "./data/releases.json",
    overridesUrl: "./data/category-overrides.json",
    editsUrl: "./data/feature-edits.json",
    sourceHtml:
      'Sources: <a href="https://www.notateslaapp.com/software-updates/history/" target="_blank" rel="noopener">notateslaapp.com software updates history</a> (feature images hosted by NotaTeslaApp); historical features 2012–2016 from <a href="https://electrek.co/2017/03/20/tesla-list-features-software-updates/" target="_blank" rel="noopener">Electrek</a>, with definitions researched from period release notes/coverage and card images matched to NotaTeslaApp screenshots (or Wikimedia Model S interior). Tesla Model 3 historical SOP/OTA entries for 2017–2019 combine public release-note archives, contemporary reporting, public specifications, and owner-reported records. Tesla Model S and Model X historical entries combine public release-note archives, contemporary reporting, public specifications, and owner-reported records. Dates and applicability may be approximate. Optional, beta, subscription-dependent, region-dependent, hardware-dependent, and owner-reported features are labeled accordingly. Shared S/X/3 coverage is shown only where the source dataset explicitly identifies the same feature and release behavior.',
  },
  rivian: {
    label: "Rivian",
    dataUrl: "./data/rivian-releases.json",
    editsUrl: "./data/feature-edits.json",
    sourceHtml:
      'Sources: <a href="https://riviantrackr.com/updates/" target="_blank" rel="noopener">riviantrackr.com/updates</a> and <a href="https://www.rivianwave.com/software-updates/" target="_blank" rel="noopener">rivianwave.com/software-updates</a>. Feature images from RivianWave when available.',
  },
};

let brand = "tesla";
const brandCache = {};
let data = null;
let groups = [];
let adminState = { state: "loading", session: null };
let workspaceMode = "chart";
let workspaceLayoutTimer = 0;
let workspaceLayoutGen = 0;
let reportExtra = {
  sopOta: "all",
  confidence: "all",
  priority: "all",
  imageStatus: "all",
  sourceType: "all",
};
let imageExtra = {
  sourceType: "all",
  evidenceLevel: "all",
  confidence: "all",
  generated: "all",
  reviewStatus: "all",
};
let imageSort = "needs-review";
let selectedImageIds = new Set();
let selectedCandidateByFeature = {};
let adminOverlays = { candidates: [], decisions: [] };
let agentStateById = {};
let imageFocusIndex = 0;
let historyExtra = { actorType: "all", actionType: "all", range: "all" };
let historyView = { items: [], total: 0, currentVersionLabel: "" };
let historyBackupState = {};
let historyRestoreState = {};
let usageView = null;

function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => Number(n) || 0);
  const pb = String(b).split(".").map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return db - da;
  }
  return 0;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function featureKey(f) {
  return featureGroupKey(f);
}

/**
 * Display priority: manual override > automatic categories from releases.json.
 * Does not mutate the on-disk releases payload.
 */
function applyCategoryOverrides(features, overrideDoc, canonicalCategories) {
  const canonical = new Set(canonicalCategories || []);
  const map = new Map();
  for (const entry of overrideDoc?.overrides || []) {
    if (!entry?.id || !Array.isArray(entry.categories) || !entry.categories.length) {
      continue;
    }
    if (entry.categories.some((c) => !canonical.has(c))) {
      console.warn(
        `[category-override] skipped ${entry.id}: invalid category`,
        entry.categories
      );
      continue;
    }
    map.set(entry.id, entry);
  }
  return (features || []).map((f) => {
    const categoriesAuto = [...(f.categories || [])];
    const primaryAuto = f.primaryCategory || categoriesAuto[0] || null;
    const entry = map.get(f.id);
    if (!entry) {
      return {
        ...f,
        categoriesAuto,
        primaryCategoryAuto: primaryAuto,
        categorySource: "automatic",
      };
    }
    return {
      ...f,
      categoriesAuto,
      primaryCategoryAuto: primaryAuto,
      categories: [...entry.categories],
      primaryCategory: entry.categories[0],
      categorySource: "override",
      categoryOverrideNote: entry.note || null,
    };
  });
}

function mergeLinks(target, incoming = []) {
  const seen = new Set(target.map((l) => l.url));
  for (const link of incoming) {
    if (!link?.url || !link?.title || seen.has(link.url)) continue;
    seen.add(link.url);
    target.push({ title: link.title, url: link.url });
  }
}

function buildGroups(features) {
  const map = new Map();
  for (const f of features) {
    const key = featureKey(f);
    let group = map.get(key);
    if (!group) {
      group = {
        title: f.title,
        description: f.description,
        categories: [...f.categories],
        categorySource: f.categorySource,
        categoriesLocked: isManualCategoryLock(f),
        image: f.image,
        imageDark: f.imageDark,
        links: [...(f.links || [])],
        availability: f.availability || null,
        models: [...(f.models || [])],
        featureIds: f.id ? [f.id] : [],
        releases: [],
      };
      map.set(key, group);
    } else {
      if (f.source === "tesla-model-s-x-2012-2019") {
        group.title = f.title;
        group.description = f.description;
      }
      if (f.id && !group.featureIds.includes(f.id)) {
        group.featureIds.push(f.id);
      }
      mergeGroupCategories(group, f);
      if (!group.image && f.image) group.image = f.image;
      else if (
        f.image &&
        isUsefulFeatureImage(f.image) &&
        !isUsefulFeatureImage(group.image)
      ) {
        group.image = f.image;
      }
      if (!group.imageDark && f.imageDark) group.imageDark = f.imageDark;
      if (!group.availability && f.availability) group.availability = f.availability;
      for (const m of f.models || []) {
        if (!group.models.includes(m)) group.models.push(m);
      }
      mergeLinks(group.links, f.links);
    }

    const already = group.releases.some((r) => r.version === f.version);
    if (!already) {
      group.releases.push({
        version: f.version,
        releaseDate: f.releaseDate,
        releaseUrl: f.releaseUrl,
      });
    }
  }

  for (const group of map.values()) {
    group.releases.sort((a, b) => compareVersions(a.version, b.version));
  }

  return [...map.values()].sort((a, b) => {
    const va = a.releases[0]?.version || "";
    const vb = b.releases[0]?.version || "";
    const v = compareVersions(va, vb);
    if (v !== 0) return v;
    return a.title.localeCompare(b.title);
  });
}

function selectedVehicleModel() {
  return modelSelect?.value || "all";
}

function scopedGroups() {
  return filterGroupsByModel(groups, selectedVehicleModel());
}

function yearFromRelease(releaseDate, version) {
  return yearFromReleaseShared(releaseDate, version);
}

function releaseInYear(release, year) {
  if (year === "all") return true;
  return yearFromRelease(release.releaseDate, release.version) === Number(year);
}

function groupMatchesYear(group, year) {
  if (year === "all") return true;
  return group.releases.some((r) => releaseInYear(r, year));
}

function availableYears() {
  const set = new Set();
  for (const g of scopedGroups()) {
    for (const r of g.releases) {
      const y = yearFromRelease(r.releaseDate, r.version);
      if (y != null) set.add(y);
    }
  }
  return [...set].sort((a, b) => b - a);
}

function versionsForFilters(category, year) {
  const set = new Set();
  for (const g of scopedGroups()) {
    if (category !== "all" && !g.categories.includes(category)) continue;
    if (!groupMatchesYear(g, year)) continue;
    for (const r of g.releases) {
      if (!releaseInYear(r, year)) continue;
      set.add(r.version);
    }
  }
  return [...set].sort(compareVersions);
}

function fillYearOptions(preserveSelection = true) {
  const previous = preserveSelection ? yearSelect.value : "all";
  const years = availableYears();

  yearSelect.innerHTML = `<option value="all">All years</option>`;
  for (const y of years) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    yearSelect.appendChild(opt);
  }

  if (previous !== "all" && years.includes(Number(previous))) {
    yearSelect.value = previous;
  } else {
    yearSelect.value = "all";
  }
}

function fillVersionOptions(preserveSelection = true) {
  const cat = categorySelect.value || "all";
  const year = yearSelect.value || "all";
  const previous = preserveSelection ? versionSelect.value : "all";
  const versions = versionsForFilters(cat, year);

  versionSelect.innerHTML = `<option value="all">All versions (${versions.length})</option>`;
  for (const v of versions) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    versionSelect.appendChild(opt);
  }

  if (previous !== "all" && versions.includes(previous)) {
    versionSelect.value = previous;
  } else {
    versionSelect.value = "all";
  }
}

function categoryCountsForFilters(year) {
  if (year === "all") {
    const counts = Object.fromEntries(data.categories.map((c) => [c, 0]));
    for (const g of scopedGroups()) {
      for (const c of g.categories) {
        if (counts[c] != null) counts[c]++;
      }
    }
    return { counts, allLabel: "All features" };
  }

  const versionsByCategory = new Map(data.categories.map((c) => [c, new Set()]));
  for (const g of scopedGroups()) {
    for (const r of g.releases) {
      if (!releaseInYear(r, year)) continue;
      for (const c of g.categories) {
        if (!versionsByCategory.has(c)) versionsByCategory.set(c, new Set());
        versionsByCategory.get(c).add(r.version);
      }
    }
  }

  const counts = Object.fromEntries(
    data.categories.map((c) => [c, versionsByCategory.get(c)?.size || 0])
  );
  return { counts, allLabel: "All features" };
}

function fillCategoryOptions(preserveSelection = true) {
  const previous = preserveSelection ? categorySelect.value : "all";
  const year = yearSelect.value || "all";
  const { counts, allLabel } = categoryCountsForFilters(year);

  categorySelect.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = allLabel;
  categorySelect.appendChild(all);

  for (const cat of categoriesSortedByOtaCount(data.categories, counts)) {
    const count = counts[cat] ?? 0;
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = `${cat} (${count})`;
    categorySelect.appendChild(opt);
  }

  if (previous !== "all" && [...categorySelect.options].some((o) => o.value === previous)) {
    categorySelect.value = previous;
  } else {
    categorySelect.value = "all";
  }
}

function fillModelOptions(preserveSelection = true) {
  const select = modelSelect || document.getElementById("model");
  if (!select) return;
  const previous = preserveSelection ? select.value : "all";
  const options = vehicleModelOptionsForBrand(brand);
  select.innerHTML = "";
  for (const item of options) {
    const opt = document.createElement("option");
    opt.value = item.value;
    opt.textContent = item.label;
    select.appendChild(opt);
  }
  if (previous && previous !== "all" && isValidVehicleModel(brand, previous)) {
    select.value = previous;
  } else {
    select.value = "all";
  }
}

function fillControls() {
  fillModelOptions(false);
  fillYearOptions(false);
  fillCategoryOptions(false);
  fillVersionOptions(false);
  updateStats();

  footerSource.innerHTML = BRAND_META[brand].sourceHtml;
  searchInput.placeholder = `Search ${BRAND_META[brand].label} features…`;
}

function updateStats() {
  if (!data || !statsEl) return;
  const model = selectedVehicleModel();
  const scoped = scopedGroups();
  let releaseCount = data.releaseCount;
  let uniqueCount = groups.length;
  let rawCount = data.featureCount;
  if (model !== "all") {
    const versions = new Set();
    rawCount = 0;
    for (const g of scoped) {
      rawCount += (g.featureIds || []).length;
      for (const r of g.releases || []) versions.add(r.version);
    }
    releaseCount = versions.size;
    uniqueCount = scoped.length;
  }

  statsEl.innerHTML = `
    <div class="stat"><strong>${releaseCount}</strong> OTA releases</div>
    <div class="stat"><strong>${uniqueCount}</strong> unique features</div>
    <div class="stat"><strong>${rawCount}</strong> raw notes</div>
  `;
}

function isSearchActive() {
  return Boolean(searchInput.value.trim());
}

function resetScopeFiltersToAll() {
  const alreadyAll =
    categorySelect.value === "all" &&
    yearSelect.value === "all" &&
    versionSelect.value === "all" &&
    !chartDrill;
  if (alreadyAll) return false;

  chartDrill = null;
  yearSelect.value = "all";
  fillCategoryOptions(false);
  fillVersionOptions(false);
  return true;
}

function clearSearchQuery() {
  if (!searchInput.value) return false;
  searchInput.value = "";
  return true;
}

function filteredGroups() {
  const scoped = scopedGroups();
  const raw = searchInput.value.trim();
  if (raw) return rankSearchResults(scoped, raw);

  const cat = categorySelect.value;
  const year = yearSelect.value;
  const ver = versionSelect.value;

  return scoped.filter((g) => {
    if (cat !== "all" && !g.categories.includes(cat)) return false;
    if (!groupMatchesYear(g, year)) return false;
    if (ver !== "all" && !g.releases.some((r) => r.version === ver && releaseInYear(r, year))) {
      return false;
    }
    return true;
  });
}

function yearlyOtaCounts(category) {
  const versionsByYear = new Map();

  for (const g of scopedGroups()) {
    if (category !== "all" && !g.categories.includes(category)) continue;
    for (const r of g.releases) {
      const year = yearFromRelease(r.releaseDate, r.version);
      if (year == null) continue;
      if (!versionsByYear.has(year)) versionsByYear.set(year, new Set());
      versionsByYear.get(year).add(r.version);
    }
  }

  const years = [...versionsByYear.keys()].sort((a, b) => a - b);
  if (years.length === 0) return [];

  const min = years[0];
  const max = years[years.length - 1];
  const series = [];
  for (let y = max; y >= min; y--) {
    series.push({ year: y, count: versionsByYear.get(y)?.size || 0 });
  }
  return series;
}

function categoryOtaCountsForYear(year) {
  const y = Number(year);
  const versionsByCategory = new Map(data.categories.map((c) => [c, new Set()]));

  for (const g of scopedGroups()) {
    for (const r of g.releases) {
      if (yearFromRelease(r.releaseDate, r.version) !== y) continue;
      for (const c of g.categories) {
        if (!versionsByCategory.has(c)) versionsByCategory.set(c, new Set());
        versionsByCategory.get(c).add(r.version);
      }
    }
  }

  return data.categories
    .map((category) => ({
      category,
      count: versionsByCategory.get(category)?.size || 0,
    }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

function renderAllYearsOtaChart() {
  const series = yearlyOtaCounts("all").map((d) => ({
    label: String(d.year),
    year: d.year,
    count: d.count,
  }));
  chartPanel.hidden = false;
  chartPanel.classList.remove("has-month-selected");
  chartTitle.textContent = "OTA Release Count by Year";
  chartSubtitle.textContent = "";
  chartSubtitle.hidden = true;

  if (series.length === 0) {
    chartTotal.textContent = "";
    chartWrap.innerHTML = `<p class="chart-subtitle">No dated OTA data.</p>`;
    return;
  }

  const total = series.reduce((sum, d) => sum + d.count, 0);
  chartTotal.innerHTML = `<span class="chart-total-main"><strong>${total}</strong> OTAs total</span><span class="chart-total-hint">Click a bar to view details</span>`;
  chartWrap.innerHTML = renderHorizontalBars(series, {
    leftPad: 56,
    labelMax: 8,
    rowH: 14,
    barH: 8,
    ariaLabel: `${BRAND_META[brand].label} OTA counts by year`,
    titleFn: (d) =>
      `${d.year}: ${d.count} OTA${d.count === 1 ? "" : "s"} · click for category breakdown`,
    drillAttrsFn: (d) =>
      d.count > 0
        ? {
            "data-chart-drill": "year",
            "data-chart-year": String(d.year),
            "aria-label": `Show OTA release count by category in ${d.year}`,
          }
        : null,
  });
  bindChartBarClicks(chartWrap);
}

function renderCategoryByYearChart() {
  const cat = categorySelect.value;

  const series = yearlyOtaCounts(cat).map((d) => ({
    label: d.year,
    year: d.year,
    count: d.count,
  }));
  chartPanel.hidden = false;
  chartTitle.textContent = `${cat} — OTA releases by year`;
  chartSubtitle.textContent = "";
  chartSubtitle.hidden = true;

  if (series.length === 0) {
    chartTotal.textContent = "";
    chartWrap.innerHTML = `<p class="chart-subtitle">No dated OTA data for this category.</p>`;
    return;
  }

  const total = series.reduce((sum, d) => sum + d.count, 0);
  chartTotal.innerHTML = `<span class="chart-total-main"><strong>${total}</strong> OTAs total</span><span class="chart-total-hint">Click a bar to view details</span>`;
  chartWrap.innerHTML = renderHorizontalBars(series, {
    leftPad: 56,
    labelMax: 8,
    rowH: 14,
    barH: 8,
    ariaLabel: `${cat} OTA counts by year`,
    titleFn: (d) => `${d.year}: ${d.count} OTA${d.count === 1 ? "" : "s"} · click for monthly breakdown`,
    drillAttrsFn: (d) =>
      d.count > 0
        ? {
            "data-chart-drill": "year",
            "data-chart-year": String(d.year),
            "data-chart-category": cat,
            "aria-label": `Show monthly OTA amounts for ${cat} in ${d.year}`,
          }
        : null,
  });
  bindChartBarClicks(chartWrap);
}

function openChartDrill(drill) {
  chartDrill = { ...drill };
  chartDetailStatus = "loading";
  chartDetailError = null;
  render();
}

function closeChartDrill() {
  chartDrill = null;
  chartDetailStatus = "idle";
  chartDetailError = null;
  chartPanel.classList.remove("is-detail", "is-cards-layout", "is-list-layout");
  chartPanel.hidden = false;
  if (chartHeaderActions) chartHeaderActions.innerHTML = "";
  applyDetailLayoutVisibility();
  render();
}

function layoutToggleHtml() {
  const cardsIcon = `
    <svg class="layout-toggle-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <rect x="1.4" y="1.4" width="5.3" height="5.3" rx="1.45" fill="none" stroke="currentColor" stroke-width="1.45"/>
      <rect x="9.3" y="1.4" width="5.3" height="5.3" rx="1.45" fill="none" stroke="currentColor" stroke-width="1.45"/>
      <rect x="1.4" y="9.3" width="5.3" height="5.3" rx="1.45" fill="none" stroke="currentColor" stroke-width="1.45"/>
      <rect x="9.3" y="9.3" width="5.3" height="5.3" rx="1.45" fill="none" stroke="currentColor" stroke-width="1.45"/>
    </svg>`;
  const listIcon = `
    <svg class="layout-toggle-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <circle cx="2.4" cy="3.4" r="1.15" fill="currentColor"/>
      <path d="M5.6 3.4h8.2" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/>
      <circle cx="2.4" cy="8" r="1.15" fill="currentColor"/>
      <path d="M5.6 8h8.2" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/>
      <circle cx="2.4" cy="12.6" r="1.15" fill="currentColor"/>
      <path d="M5.6 12.6h8.2" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/>
    </svg>`;
  return `
    <div class="layout-toggle" role="group" aria-label="Feature layout">
      <button type="button" class="layout-toggle-btn${detailLayout === "cards" ? " is-active" : ""}" data-layout="cards" aria-pressed="${detailLayout === "cards"}" aria-label="Cards layout" title="Cards">${cardsIcon}</button>
      <button type="button" class="layout-toggle-btn${detailLayout === "list" ? " is-active" : ""}" data-layout="list" aria-pressed="${detailLayout === "list"}" aria-label="List layout" title="List">${listIcon}</button>
    </div>
  `;
}

function bindLayoutToggle(root) {
  root?.querySelectorAll("[data-layout]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-layout");
      if (next !== "list" && next !== "cards") return;
      if (detailLayout === next) return;
      // Layout only — filters, search, and drill scope stay untouched.
      detailLayout = next;
      render();
    });
  });
}

/** List/Cards switch sits in the result-meta gutter whenever results are shown. */
function layoutSwitchAvailable() {
  return Boolean(data);
}

/** Drill scope for the shared List/Cards view-model (bar drill, category filter, or all). */
function effectiveDetailDrill() {
  if (chartDrill) return chartDrill;
  const cat = categorySelect.value;
  if (cat !== "all") return { category: cat, barLabel: cat };
  return { barLabel: "All features" };
}

function applyDetailLayoutVisibility() {
  const switchOn = layoutSwitchAvailable() && !isSearchActive();
  const listMode = switchOn && detailLayout === "list";
  const cardsMode = switchOn && detailLayout === "cards";
  const inChartDetail = Boolean(chartDrill);
  const monthToggleOnTimeline =
    chartDrill?.month != null &&
    yearSelect.value !== "all" &&
    categorySelect.value !== "all";

  chartPanel.classList.toggle("is-list-layout", inChartDetail && listMode && !monthToggleOnTimeline);
  chartPanel.classList.toggle("is-cards-layout", inChartDetail && cardsMode && !monthToggleOnTimeline);
  document.body.classList.toggle("detail-list-mode", listMode);
  document.body.classList.toggle("detail-cards-mode", cardsMode);

  // Hide/clear chart body only for drills that replace the chart (not month toggle).
  if (inChartDetail && chartWrap && !monthToggleOnTimeline) {
    chartWrap.innerHTML = "";
  }

  if (resultMeta) {
    resultMeta.hidden = false;
  }
  if (resultsEl) {
    resultsEl.hidden = false;
    resultsEl.classList.toggle("is-detail-list", listMode);
  }
}

function renderChartDetailChrome() {
  if (chartHeaderActions) chartHeaderActions.innerHTML = "";
}

function currentFilterState() {
  return {
    model: selectedVehicleModel(),
    category: categorySelect.value || "all",
    year: yearSelect.value || "all",
    version: versionSelect.value || "all",
    search: searchInput.value.trim(),
  };
}

function syncCategoryFilterFromBar(category) {
  if (!category) return false;
  if (![...categorySelect.options].some((o) => o.value === category)) return false;
  if (categorySelect.value === category) return true;
  categorySelect.value = category;
  fillVersionOptions(true);
  return true;
}

function syncYearFilterFromBar(year) {
  if (year == null || year === "" || year === "all") return false;
  const value = String(year);
  if (![...yearSelect.options].some((o) => o.value === value)) return false;
  if (yearSelect.value === value) return true;
  yearSelect.value = value;
  fillCategoryOptions(true);
  fillVersionOptions(true);
  return true;
}

function playChartFadeOut() {
  return new Promise((resolve) => {
    const finish = () => resolve();
    if (!chartWrap || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      finish();
      return;
    }
    chartWrap.classList.add("is-fading-out");
    const fallback = window.setTimeout(finish, 240);
    chartWrap.addEventListener(
      "animationend",
      () => {
        window.clearTimeout(fallback);
        finish();
      },
      { once: true }
    );
  });
}

function drillChartFromBar(_el, after) {
  pendingChartZoom = { fade: true };
  playChartFadeOut()
    .catch(() => {})
    .then(() => {
      after();
    });
}

function playPendingChartZoom() {
  if (!pendingChartZoom || !chartWrap) return;
  pendingChartZoom = null;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  chartWrap.classList.remove("is-zooming", "is-fading-out");
  void chartWrap.offsetWidth;
  chartWrap.classList.add("is-zooming");
  chartWrap.addEventListener(
    "animationend",
    () => chartWrap.classList.remove("is-zooming"),
    { once: true }
  );
}

function bindChartBarClicks(root) {
  root.querySelectorAll("[data-chart-drill]").forEach((el) => {
    const activate = () => {
      const kind = el.getAttribute("data-chart-drill");
      const category =
        el.getAttribute("data-chart-category") ||
        (categorySelect.value !== "all" ? categorySelect.value : null);
      const year = el.getAttribute("data-chart-year");
      const month = el.getAttribute("data-chart-month");

      if (kind === "category" && category) {
        syncCategoryFilterFromBar(category);
        const yearValue =
          year || (yearSelect.value !== "all" ? yearSelect.value : null);
        if (yearValue) {
          syncYearFilterFromBar(yearValue);
          // Zoom into monthly OTA timeline for this category + year (keep chart visible).
          drillChartFromBar(el, () => {
            chartDrill = null;
            chartDetailStatus = "idle";
            chartDetailError = null;
            render();
          });
          return;
        }
        openChartDrill({ category, barLabel: category });
        return;
      }
      if (kind === "year" && year) {
        const cat =
          category ||
          (categorySelect.value !== "all" ? categorySelect.value : null);
        if (cat) syncCategoryFilterFromBar(cat);
        syncYearFilterFromBar(year);
        // Zoom into monthly OTA amounts for this year (keep chart visible).
        drillChartFromBar(el, () => {
          chartDrill = null;
          chartDetailStatus = "idle";
          chartDetailError = null;
          render();
        });
        return;
      }
      if (kind === "month" && month != null && month !== "") {
        const cat =
          category ||
          (categorySelect.value !== "all" ? categorySelect.value : null);
        if (cat) syncCategoryFilterFromBar(cat);
        const yearValue =
          year || (yearSelect.value !== "all" ? yearSelect.value : null);
        if (yearValue) syncYearFilterFromBar(yearValue);
        const monthNum = Number(month);
        const label =
          el.getAttribute("data-chart-label") ||
          `${MONTH_LABELS[monthNum] || month} ${yearValue || ""}`.trim();

        // Toggle: click selected month again to clear and show the full year.
        const sameMonthSelected =
          chartDrill &&
          chartDrill.month === monthNum &&
          String(chartDrill.year ?? "") === String(yearValue ?? "") &&
          (chartDrill.category || null) === (cat || null);

        if (sameMonthSelected) {
          chartDrill = null;
          chartDetailStatus = "idle";
          chartDetailError = null;
        } else {
          chartDrill = {
            category: cat || undefined,
            year: yearValue || undefined,
            month: monthNum,
            barLabel: `${cat || "Features"} · ${label}`,
          };
          chartDetailStatus = "ready";
          chartDetailError = null;
        }
        render();
      }
    };

    el.addEventListener("click", activate);
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      activate();
    });
  });
}

function dayFromRelease(releaseDate) {
  const iso = String(releaseDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Number(iso[3]);
  const named = String(releaseDate || "").match(/\b(\d{1,2}),\s*\d{4}/);
  if (named) return Number(named[1]);
  const local = new Date(releaseDate);
  if (Number.isNaN(local.getTime())) return null;
  return local.getDate();
}

function chartHorizontalPill(x, y, width, height, tip, radius = 2) {
  const r = Math.min(radius, height / 2);
  const w = Math.max(width, 4);
  return `<rect class="chart-bar" x="${x}" y="${y}" width="${w}" height="${height}" rx="${r}" ry="${r}">
            <title>${escapeHtml(tip)}</title>
          </rect>`;
}

function chartDayMarks(x, y, width, height, days, year, month) {
  if (!days?.length || width < 8) return "";
  const daysInMonth = new Date(year, month + 1, 0).getDate() || 31;
  const size = Math.min(10, Math.max(9, height - 3));
  const r = size / 2;
  const minX = x + r + 1;
  const maxX = x + width - r - 1;
  const span = Math.max(maxX - minX, 1);
  const minGap = size + 3;
  let lastCx = -Infinity;
  const cy = y + height / 2;
  return days
    .map((item) => {
      const t = (item.day - 0.5) / daysInMonth;
      let cx = minX + t * span;
      if (cx - lastCx < minGap) cx = lastCx + minGap;
      lastCx = cx;
      const versions = (item.versions || []).join(", ");
      const tip = `${MONTH_LABELS[month] || ""} ${item.day}${
        versions ? ` · ${versions}` : item.count > 1 ? ` · ${item.count} OTAs` : ""
      }`;
      return `<g class="chart-day-mark">
        <circle class="chart-day-mark-pill" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}">
          <title>${escapeHtml(tip.trim())}</title>
        </circle>
        <text class="chart-day-mark-label" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${item.day}</text>
      </g>`;
    })
    .join("");
}

function renderHorizontalBars(series, {
  valueKey = "count",
  labelKey = "label",
  titleFn,
  drillAttrsFn,
  isSelectedFn,
  ariaLabel = "OTA counts",
  labelMax = 22,
  leftPad = 168,
  rowH = 16,
  barH = 8,
  selectedRowH,
  selectedBarH,
} = {}) {
  const width = 720;
  const pad = { top: 8, right: 72, bottom: 22, left: leftPad };
  const rowHeights = series.map((d) =>
    isSelectedFn?.(d) && selectedRowH ? selectedRowH : rowH
  );
  const height = pad.top + pad.bottom + rowHeights.reduce((sum, h) => sum + h, 0);
  const innerW = width - pad.left - pad.right;
  const maxCount = Math.max(...series.map((d) => d[valueKey]), 1);
  const anySelected = typeof isSelectedFn === "function" && series.some((d) => isSelectedFn(d));

  const gridLines = [0.25, 0.5, 0.75, 1]
    .map((t) => {
      const x = pad.left + t * innerW;
      const val = Math.round(maxCount * t);
      return `
        <line class="chart-grid" x1="${x}" y1="${pad.top}" x2="${x}" y2="${height - pad.bottom}" />
        <text class="chart-tick" x="${x}" y="${height - 6}" text-anchor="middle">${val}</text>
      `;
    })
    .join("");

  let rowTop = pad.top;
  const bars = series
    .map((d) => {
      const count = d[valueKey];
      const rawLabel = String(d[labelKey] ?? "");
      const label = rawLabel.length > labelMax ? `${rawLabel.slice(0, labelMax - 2)}…` : rawLabel;
      const thisRowH = isSelectedFn?.(d) && selectedRowH ? selectedRowH : rowH;
      const selected = Boolean(isSelectedFn?.(d));
      const thisBarH = selected && selectedBarH ? selectedBarH : barH;
      const barWidth = (count / maxCount) * innerW;
      const days = selected && Array.isArray(d.days) ? d.days : [];
      let displayWidth = count ? Math.max(barWidth, 4) : 0;
      if (days.length) {
        displayWidth = Math.max(displayWidth, Math.min(innerW, days.length * 13 + 8));
      }
      const yOff = Math.round((thisRowH - thisBarH) / 2);
      const y = rowTop + yOff;
      const textY = y + Math.round(thisBarH / 2) + 4;
      const tip = titleFn ? titleFn(d) : `${rawLabel}: ${count}`;
      const drillAttrs = drillAttrsFn ? drillAttrsFn(d) : null;
      const clickable = Boolean(drillAttrs) && count > 0;
      const attrStr = clickable
        ? Object.entries(drillAttrs)
            .map(([k, v]) => `${k}="${escapeHtml(String(v))}"`)
            .join(" ")
        : "";
      const stateClass = selected
        ? " is-selected"
        : anySelected
          ? " is-dimmed"
          : "";
      const hitAttrs = clickable
        ? ` class="chart-bar-hit${stateClass}" role="button" tabindex="0" aria-pressed="${selected ? "true" : "false"}" ${attrStr}`
        : stateClass
          ? ` class="${stateClass.trim()}"`
          : "";
      const valueLabel = selected
        ? `${count} OTA${count === 1 ? "" : "s"}`
        : String(count);
      const dayMarks = days.length
        ? chartDayMarks(pad.left, y, displayWidth, thisBarH, days, d.year, d.month)
        : "";
      const barRect = count
        ? `${chartHorizontalPill(pad.left, y, displayWidth, thisBarH, tip, selected ? 3 : 2)}
          ${dayMarks}
          <text class="chart-value" x="${pad.left + displayWidth + 6}" y="${textY}">${valueLabel}</text>`
        : "";
      const rowMarkup = `
        <g${hitAttrs}>
          ${clickable ? `<rect class="chart-bar-hitarea" x="0" y="${rowTop}" width="${width}" height="${thisRowH}" />` : ""}
          <text class="chart-label" x="${pad.left - 10}" y="${textY}" text-anchor="end">
            <title>${escapeHtml(rawLabel)}</title>
            ${escapeHtml(label)}
          </text>
          ${barRect}
        </g>
      `;
      rowTop += thisRowH;
      return rowMarkup;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="list" aria-label="${escapeHtml(ariaLabel)}">
      <line class="chart-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" />
      ${gridLines}
      ${bars}
    </svg>
  `;
}

function renderYearCategoryChart(year) {
  const series = categoryOtaCountsForYear(year);
  chartPanel.hidden = false;
  chartPanel.classList.remove("has-month-selected");
  chartTitle.textContent = `OTA Release Count by Category (${year})`;
  chartSubtitle.textContent = "";
  chartSubtitle.hidden = true;

  if (series.length === 0) {
    chartTotal.textContent = "";
    chartWrap.innerHTML = `<p class="chart-subtitle">No dated OTA data for ${year}.</p>`;
    return;
  }

  const totalVersions = new Set();
  for (const g of scopedGroups()) {
    for (const r of g.releases) {
      if (yearFromRelease(r.releaseDate, r.version) === Number(year)) {
        totalVersions.add(r.version);
      }
    }
  }
  chartTotal.innerHTML = `<span class="chart-total-main"><strong>${totalVersions.size}</strong> OTAs in ${year}</span><span class="chart-total-hint">Click a bar to view details</span>`;

  chartWrap.innerHTML = renderHorizontalBars(
    series.map((d) => ({ ...d, label: d.category })),
    {
      rowH: 15,
      barH: 8,
      ariaLabel: "OTA counts by category",
      titleFn: (d) =>
        `${d.category}: ${d.count} OTA${d.count === 1 ? "" : "s"} · click for monthly timeline`,
      drillAttrsFn: (d) => ({
        "data-chart-drill": "category",
        "data-chart-category": d.category,
        "data-chart-year": String(year),
        "data-chart-label": d.category,
        "aria-label": `Show monthly OTA timeline for ${d.category} in ${year}`,
      }),
    }
  );
  bindChartBarClicks(chartWrap);
  playPendingChartZoom();
}

function monthlyOtaCountsForCategory(category, year) {
  const y = Number(year);
  const versionsByMonth = Array.from({ length: 12 }, () => new Set());
  const daysByMonth = Array.from({ length: 12 }, () => new Map());

  for (const g of scopedGroups()) {
    if (!g.categories.includes(category)) continue;
    for (const r of g.releases) {
      if (yearFromRelease(r.releaseDate, r.version) !== y) continue;
      const m = monthFromRelease(r.releaseDate);
      if (m == null) continue;
      versionsByMonth[m].add(r.version);
      const day = dayFromRelease(r.releaseDate);
      if (day == null) continue;
      if (!daysByMonth[m].has(day)) daysByMonth[m].set(day, new Set());
      daysByMonth[m].get(day).add(r.version);
    }
  }

  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return labels.map((label, i) => ({
    label,
    month: i,
    year: y,
    count: versionsByMonth[i].size,
    days: [...daysByMonth[i].entries()]
      .map(([day, versions]) => ({
        day,
        count: versions.size,
        versions: [...versions],
      }))
      .sort((a, b) => a.day - b.day),
  }));
}

function renderVerticalBars(series, { valueKey = "count", labelKey = "label", titleFn, drillAttrsFn, isSelectedFn } = {}) {
  const width = 720;
  const height = 228;
  const pad = { top: 22, right: 16, bottom: 36, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxCount = Math.max(...series.map((d) => d[valueKey]), 1);
  const slotW = innerW / Math.max(series.length, 1);
  const barW = Math.max(7, Math.min(11, slotW * 0.22));
  const radius = barW / 2;
  const anySelected = typeof isSelectedFn === "function" && series.some((d) => isSelectedFn(d));

  const gridLines = [0.25, 0.5, 0.75, 1]
    .map((t) => {
      const y = pad.top + innerH - t * innerH;
      const val = Math.round(maxCount * t);
      return `
        <line class="chart-grid" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" />
        <text class="chart-label" x="${pad.left - 8}" y="${y + 4}" text-anchor="end">${val}</text>
      `;
    })
    .join("");

  const bars = series
    .map((d, i) => {
      const count = d[valueKey];
      const h = (count / maxCount) * innerH;
      const barH = count ? Math.max(h, barW) : 0;
      const xSlot = pad.left + i * slotW;
      const x = xSlot + (slotW - barW) / 2;
      const y = pad.top + innerH - barH;
      const labelY = height - 12;
      const valueY = y - 6;
      const tip = titleFn ? titleFn(d) : `${d[labelKey]}: ${count}`;
      const drillAttrs = drillAttrsFn ? drillAttrsFn(d) : null;
      const clickable = Boolean(drillAttrs) && count > 0;
      const selected = Boolean(isSelectedFn?.(d));
      const attrStr = clickable
        ? Object.entries(drillAttrs)
            .map(([k, v]) => `${k}="${escapeHtml(String(v))}"`)
            .join(" ")
        : "";
      const stateClass = selected
        ? " is-selected"
        : anySelected && clickable
          ? " is-dimmed"
          : "";
      const hitAttrs = clickable
        ? ` class="chart-bar-hit${stateClass}" role="button" tabindex="0" aria-pressed="${selected ? "true" : "false"}" ${attrStr}`
        : "";
      const hitPad = clickable
        ? `<rect class="chart-bar-hitarea" x="${xSlot}" y="${pad.top}" width="${slotW}" height="${innerH}" />`
        : "";
      return `
        <g${hitAttrs}>
          ${hitPad}
          <rect class="chart-bar" x="${x}" y="${y}" width="${barW}" height="${barH}" rx="${radius}" ry="${radius}">
            <title>${escapeHtml(tip)}</title>
          </rect>
          ${count ? `<text class="chart-value" x="${x + barW / 2}" y="${valueY}" text-anchor="middle">${count}</text>` : ""}
          <text class="chart-label" x="${x + barW / 2}" y="${labelY}" text-anchor="middle">${escapeHtml(String(d[labelKey]))}</text>
        </g>
      `;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="presentation">
      <line class="chart-axis" x1="${pad.left}" y1="${pad.top + innerH}" x2="${width - pad.right}" y2="${pad.top + innerH}" />
      ${gridLines}
      ${bars}
    </svg>
  `;
}

function renderCategoryInYearChart(category, year) {
  const series = monthlyOtaCountsForCategory(category, year);
  const total = series.reduce((sum, d) => sum + d.count, 0);
  const selectedMonth =
    chartDrill?.month != null &&
    String(chartDrill.year ?? "") === String(year) &&
    (chartDrill.category || null) === category
      ? Number(chartDrill.month)
      : null;
  const selectedLabel =
    selectedMonth != null && selectedMonth >= 0 && selectedMonth < 12
      ? MONTH_LABELS[selectedMonth]
      : null;
  const monthSelected = selectedMonth != null && selectedLabel;

  chartPanel.hidden = false;
  chartPanel.classList.toggle("has-month-selected", Boolean(monthSelected));
  chartTitle.textContent = `${category} — OTA releases in ${year}`;
  chartSubtitle.textContent = "";
  chartSubtitle.hidden = true;

  if (total === 0) {
    chartTotal.textContent = "";
    chartWrap.innerHTML = `<p class="chart-subtitle">No dated ${escapeHtml(category)} OTA data for ${year}.</p>`;
    return;
  }

  if (monthSelected) {
    const monthCount = series.find((d) => d.month === selectedMonth)?.count ?? 0;
    chartTotal.innerHTML = `<span class="chart-total-main"><strong>${monthCount}</strong> OTAs in ${selectedLabel}</span><span class="chart-total-hint">Click bar again to clear</span>`;
  } else {
    chartTotal.innerHTML = `<span class="chart-total-main"><strong>${total}</strong> OTAs in ${year}</span><span class="chart-total-hint">Click a bar to view details</span>`;
  }

  chartWrap.innerHTML = renderHorizontalBars(series, {
    leftPad: 56,
    labelMax: 8,
    rowH: 14,
    barH: 8,
    selectedRowH: 18,
    selectedBarH: 12,
    ariaLabel: `${category} OTA counts by month in ${year}`,
    titleFn: (d) => {
      const dayList = (d.days || []).map((item) => item.day).join(", ");
      if (selectedMonth === d.month) {
        return `${d.label} ${year}: ${d.count} OTA${d.count === 1 ? "" : "s"}${
          dayList ? ` on the ${dayList}` : ""
        } · selected · click again to show all of ${year}`;
      }
      return `${d.label} ${year}: ${d.count} OTA${d.count === 1 ? "" : "s"} · click to filter feature cards`;
    },
    isSelectedFn: (d) => selectedMonth === d.month,
    drillAttrsFn: (d) =>
      d.count > 0
        ? {
            "data-chart-drill": "month",
            "data-chart-month": String(d.month),
            "data-chart-year": String(year),
            "data-chart-category": category,
            "data-chart-label": `${d.label} ${year}`,
            "aria-label":
              selectedMonth === d.month
                ? `Clear ${d.label} ${year} filter and show all ${category} features for ${year}`
                : `Filter feature cards to ${category} in ${d.label} ${year}`,
          }
        : null,
  });
  bindChartBarClicks(chartWrap);
  playPendingChartZoom();
}

function renderChartDetailShell({ status, message }) {
  if (status === "loading") {
    return `<div class="chart-detail-status" role="status">Loading OTA details…</div>`;
  }
  if (status === "error") {
    return `<div class="chart-detail-status chart-detail-error" role="alert">
      <p>${escapeHtml(message || "Failed to load details.")}</p>
      <button type="button" class="chart-back-btn" data-chart-retry>Try again</button>
    </div>`;
  }
  if (status === "empty") {
    return `<div class="chart-detail-status" role="status">
      <p>${escapeHtml(message || "No matching OTA entries.")}</p>
    </div>`;
  }
  return "";
}

function formatChartDetailDate(releaseDate) {
  if (!releaseDate) return "Date unknown";
  const iso = String(releaseDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const monthIdx = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${months[monthIdx]} ${day}, ${iso[1]}`;
    }
  }
  return String(releaseDate);
}

function renderListReleaseMeta(releases) {
  const list = releases || [];
  if (!list.length) {
    return `
      <div class="chart-detail-row-meta">
        <span class="chart-detail-chip chart-detail-chip-static chart-detail-chip-date">Date unknown</span>
      </div>`;
  }
  const primary = list[0];
  const dateLabel = formatChartDetailDate(primary.releaseDate);

  // Single release: same chip look as the dropdowns, but no chevron and no outbound link.
  if (list.length === 1) {
    return `
      <div class="chart-detail-row-meta">
        <span class="chart-detail-chip chart-detail-chip-static chart-detail-chip-version">${escapeHtml(primary.version)}</span>
        <span class="chart-detail-chip chart-detail-chip-static chart-detail-chip-date">${escapeHtml(dateLabel)}</span>
      </div>`;
  }

  const versionOptions = list
    .map(
      (r, idx) =>
        `<option value="${idx}" ${idx === 0 ? "selected" : ""}>${escapeHtml(r.version)}</option>`
    )
    .join("");
  const dateOptions = list
    .map((r, idx) => {
      const date = formatChartDetailDate(r.releaseDate);
      return `<option value="${idx}" ${idx === 0 ? "selected" : ""}>${escapeHtml(date)}</option>`;
    })
    .join("");
  const payload = escapeHtml(JSON.stringify(list));

  return `
    <div class="chart-detail-row-meta chart-detail-row-meta-multi card-footer-multi" data-releases="${payload}">
      <label class="footer-select chart-detail-chip-wrap">
        <span class="sr-only">OTA version</span>
        <select class="footer-version-select chart-detail-chip chart-detail-chip-select chart-detail-chip-version" aria-label="OTA version">${versionOptions}</select>
      </label>
      <label class="footer-select footer-select-date chart-detail-chip-wrap">
        <span class="sr-only">Release date</span>
        <select class="footer-date-select chart-detail-chip chart-detail-chip-select chart-detail-chip-date" aria-label="Release date">${dateOptions}</select>
      </label>
    </div>`;
}

function renderGroupedDetailHtml(featureGrouped) {
  if (!featureGrouped) return "";

  // One path for all-years and specific-year. One unique feature per row; multi-OTA via dropdown.
  return flattenDetailMonths(featureGrouped)
    .map((monthBlock) => {
      const features = monthBlock.features || [];
      if (!features.length) return "";
      const featureLabel = `${features.length} feature${features.length === 1 ? "" : "s"}`;
      const rows = features.map((f) => {
        const ids = escapeHtml(JSON.stringify(f.featureIds || [f.featureId]));
        const intro = shortFeatureIntro(f.description);
        const introHtml = intro
          ? `<p class="chart-detail-row-intro">${escapeHtml(intro)}</p>`
          : "";
        return `
          <li class="chart-detail-row"
            role="button"
            tabindex="0"
            data-feature-ids='${ids}'
            aria-label="Open feature card: ${escapeHtml(f.title)}">
            <div class="chart-detail-row-main">
              <span class="chart-detail-row-title">${escapeHtml(f.title)}</span>
              ${introHtml}
            </div>
            ${renderListReleaseMeta(f.releases)}
          </li>`;
      });

      return `
      <section class="chart-detail-month">
        <h3 class="chart-detail-month-title">
          <span class="chart-detail-month-label">${escapeHtml(monthBlock.headingLabel)}</span>
          <span class="chart-detail-month-count">${escapeHtml(featureLabel)}</span>
        </h3>
        <ul class="chart-detail-rows">${rows.join("")}</ul>
      </section>`;
    })
    .join("");
}

function bindChartDetailChrome() {
  resultsEl.querySelector("[data-chart-retry]")?.addEventListener("click", () => {
    render();
  });
  resultsEl.querySelectorAll(".chart-detail-row[data-feature-ids]").forEach((row) => {
    const open = () => {
      let ids = [];
      try {
        ids = JSON.parse(row.getAttribute("data-feature-ids") || "[]");
      } catch {
        ids = [];
      }
      const title = row.querySelector(".chart-detail-row-title")?.textContent?.trim();
      openFeatureCardByIds(ids, title);
    };
    row.addEventListener("click", (e) => {
      // Keep version links / dropdowns interactive without opening the card.
      if (e.target.closest("a, select, label, .chart-detail-row-meta-multi")) return;
      open();
    });
    row.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.target.closest("a, select, label")) return;
      e.preventDefault();
      open();
    });
  });
  bindFooterSelects(resultsEl);
}

function findFeatureGroup(featureIds, titleFallback) {
  const idSet = new Set(featureIds || []);
  const pools = [filteredGroups(), groups];
  for (const pool of pools) {
    const byId = pool.find((g) =>
      (g.featureIds || []).some((id) => idSet.has(id))
    );
    if (byId) return byId;
    const byTitle = pool.find(
      (g) => titleFallback && g.title === titleFallback
    );
    if (byTitle) return byTitle;
  }
  return null;
}

function isExternalSourceCardLink(link) {
  const url = String(link?.url || "");
  const title = String(link?.title || "").trim();
  return /rivianwave\.com/i.test(url) || /^rivianwave$/i.test(title);
}

function renderFeatureCardHtml(f, i = 0) {
  const q = isSearchActive() ? searchInput.value.trim() : "";
  const cats = renderCategoryBadges(f.categories, q);
  const showImage =
    brand === "rivian" ? isUsefulFeatureImage(f.image) : Boolean(f.image);
  const collapsedMedia = showImage
    ? renderMedia(f.image, f.title, "card-media-collapsed")
    : brand === "rivian"
      ? ""
      : renderMedia(f.image, f.title, "card-media-collapsed");
  const expandedMedia = showImage
    ? renderMedia(f.image, f.title, "card-media-expanded has-image")
    : brand === "rivian"
      ? ""
      : `<div class="card-media card-media-expanded"></div>`;
  const description = f.description || "No description provided.";
  const titleHtml = q ? highlightSearchHtml(f.title, q) : escapeHtml(f.title);
  const descHtml =
    q && f.description
      ? highlightSearchHtml(f.description, q)
      : escapeHtml(description);
  const links = (f.links || [])
    .filter((link) => !isExternalSourceCardLink(link))
    .map(
      (link) => `
            <a class="feature-link-btn" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">
              <span class="feature-link-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.7">
                  <path d="M6.5 9.5l3-3"/>
                  <path d="M7.2 4.8l.9-.9a2.5 2.5 0 013.5 3.5l-.9.9"/>
                  <path d="M8.8 11.2l-.9.9a2.5 2.5 0 01-3.5-3.5l.9-.9"/>
                </svg>
              </span>
              <span>${escapeHtml(link.title)}</span>
            </a>`
    )
    .join("");
  const linksBlock = links ? `<div class="feature-links">${links}</div>` : "";
  const featureIds = JSON.stringify(f.featureIds || []);
  return `
        <article
          class="card${brand === "rivian" && !showImage ? " card-no-media" : ""}"
          style="animation-delay:${Math.min(i, 12) * 0.03}s"
          data-feature-ids='${escapeHtml(featureIds)}'
          data-categories='${escapeHtml(JSON.stringify(f.categories || []))}'
          data-image="${escapeHtml(f.image || "")}"
          data-image-dark="${escapeHtml(f.imageDark || "")}"
          data-dirty="0"
        >
          <button type="button" class="card-edit-btn" aria-label="Edit feature"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.6 3.6a1.8 1.8 0 0 1 2.5 2.5L8.2 17.1 4.2 18.1l1-4 11.4-10.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14.4 5.8 18.2 9.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
          <button type="button" class="card-close" aria-label="Close expanded card"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 7.2 16.8 16.8M16.8 7.2 7.2 16.8" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round"/></svg></button>
          ${collapsedMedia}
          ${expandedMedia}
          <div class="card-body">
            <h2 class="card-title-view">${titleHtml}</h2>
            <div class="card-top">${cats}</div>
            ${linksBlock}
            <div class="card-desc">
              <p class="card-desc-text is-clamped">${descHtml}</p>
            </div>
            ${renderFeatureMeta(f)}
            ${renderReleaseFooter(f.releases)}
          </div>
        </article>
      `;
}

function clearFeatureDetailHost() {
  if (!featureDetailHost) return;
  featureDetailHost.innerHTML = "";
  featureDetailHost.hidden = true;
}

function mountAndExpandFeatureCard(group) {
  if (!featureDetailHost || !group) return;
  if (!collapseExpandedCard()) return;
  featureDetailHost.hidden = false;
  featureDetailHost.innerHTML = renderFeatureCardHtml(group, 0);
  bindFooterSelects(featureDetailHost);
  bindCardExpand(featureDetailHost);
  const card = featureDetailHost.querySelector(".card");
  if (!card) return;
  expandCard(card);
}

function openFeatureCardByIds(featureIds, titleFallback) {
  // Always open detail in the overlay host so Cards/List stay put behind the backdrop.
  const group = findFeatureGroup(featureIds, titleFallback);
  if (!group) return;
  mountAndExpandFeatureCard(group);
}

function expandCardFromGridCard(card) {
  if (!card || card.classList.contains("is-expanded")) return;
  if (card.closest("#featureDetailHost")) {
    expandCard(card);
    return;
  }
  let featureIds = [];
  try {
    featureIds = JSON.parse(card.dataset.featureIds || "[]");
  } catch {
    featureIds = [];
  }
  const title = card.querySelector(".card-title-view")?.textContent?.trim();
  const group = findFeatureGroup(featureIds, title);
  if (group) {
    mountAndExpandFeatureCard(group);
    return;
  }
  expandCard(card);
}

function expandCard(card) {
  if (!collapseExpandedCard()) return;
  card.classList.add("is-expanded");
  cardBackdrop.hidden = false;
  document.body.classList.add("card-expanded-open");
  card.querySelector(".card-close")?.focus();
}

function isAdminAuthenticated() {
  return adminState.state === "authenticated" && adminState.session?.role === "admin";
}

function closeAdminDialog() {
  if (!adminDialogHost) return;
  adminDialogHost.hidden = true;
  adminDialogHost.innerHTML = "";
}

function openAdminDialog({ title, body, primaryLabel, onPrimary }) {
  if (!adminDialogHost) return;
  adminDialogHost.hidden = false;
  adminDialogHost.innerHTML = `
    <div class="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="adminDialogTitle">
      <h2 id="adminDialogTitle">${escapeHtml(title)}</h2>
      <p>${body}</p>
      <div class="admin-dialog-actions">
        <button type="button" class="btn-text" data-admin-dialog="cancel">Cancel</button>
        ${primaryLabel ? `<button type="button" class="admin-login-btn" data-admin-dialog="ok">${escapeHtml(primaryLabel)}</button>` : ""}
      </div>
    </div>`;
  const dialog = adminDialogHost.querySelector(".admin-dialog");
  dialog?.querySelector("[data-admin-dialog='ok'], [data-admin-dialog='cancel']")?.focus();
  adminDialogHost.onclick = (e) => {
    if (e.target === adminDialogHost) closeAdminDialog();
  };
  dialog.querySelector("[data-admin-dialog='cancel']")?.addEventListener("click", closeAdminDialog);
  dialog.querySelector("[data-admin-dialog='ok']")?.addEventListener("click", async () => {
    closeAdminDialog();
    await onPrimary?.();
  });
}

function renderAdminAuth() {
  if (!adminAuthHost) return;
  if (adminState.state === "loading") {
    adminAuthHost.innerHTML = `<span class="admin-muted">Checking admin…</span>`;
    return;
  }
  if (adminState.state === "authenticated" && adminState.session) {
    adminAuthHost.innerHTML = `
      <div class="admin-auth-split" role="group" aria-label="Admin">
        <button type="button" class="admin-signout-btn">Sign out</button>
        <button type="button" class="admin-menu-btn">Menu</button>
      </div>`;
    adminAuthHost.querySelector(".admin-signout-btn")?.addEventListener("click", async () => {
      await logoutAdmin();
      adminState = { state: "unauthenticated", session: null };
      renderAdminAuth();
      if (workspaceMode !== "chart") {
        setWorkspaceMode("chart");
      } else {
        render();
      }
    });
    adminAuthHost.querySelector(".admin-menu-btn")?.addEventListener("click", () => {
      if (workspaceMode === "chart") {
        setWorkspaceMode("report");
      }
    });
    return;
  }
  adminAuthHost.innerHTML = `<button type="button" class="admin-login-btn">Admin Login</button>`;
  adminAuthHost.querySelector(".admin-login-btn")?.addEventListener("click", onAdminLoginClick);
}

async function onAdminLoginClick() {
  const localHost =
    location.hostname === "127.0.0.1" || location.hostname === "localhost";
  if (!localHost && adminState.state === "not-configured") {
    openAdminDialog({
      title: "Provider not configured",
      body: "Admin login is not available on GitHub Pages. Open <code>http://127.0.0.1:5173/</code> after <code>npm start</code>.",
      primaryLabel: "OK",
      onPrimary: closeAdminDialog,
    });
    return;
  }
  if (adminState.state === "unauthorized") {
    openAdminDialog({
      title: "Unauthorized",
      body: "This account is not on the server allowlist.",
      primaryLabel: "OK",
      onPrimary: closeAdminDialog,
    });
    return;
  }
  openAdminDialog({
    title: "Admin login",
    body: "Development mock — not production security. Continue as Admin for local review only.",
    primaryLabel: "Continue",
    onPrimary: async () => {
      const result = await loginAdminMock();
      if (!result.ok) {
        adminState = { state: result.state || "error", session: null };
        renderAdminAuth();
        openAdminDialog({
          title: result.state === "not-configured" ? "Local server not running" : "Login failed",
          body:
            result.state === "not-configured"
              ? "Restart the tracker with <code>npm start</code>, then open <code>http://127.0.0.1:5173/</code> and try Admin Login again."
              : escapeHtml(result.message || "Login failed"),
          primaryLabel: "OK",
          onPrimary: closeAdminDialog,
        });
        return;
      }
      adminState = { state: "authenticated", session: result.session };
      await loadAdminOverlays();
      renderAdminAuth();
      render();
    },
  });
}

function renderWorkspaceModeBar() {
  if (!workspaceModeHost) return;
  if (!isAdminAuthenticated() || workspaceMode === "chart") {
    workspaceModeHost.hidden = true;
    workspaceModeHost.innerHTML = "";
    return;
  }
  workspaceModeHost.hidden = false;
  const mock = Boolean(adminState.session?.mock);
  workspaceModeHost.innerHTML = `
    <div class="admin-workspace-toolbar">
      <div class="admin-workspace-toolbar-row">
        <div class="admin-workspace-nav">
          <div class="workspace-brand-toggle" role="group" aria-label="Brand">
            <button type="button" class="workspace-brand-btn${brand === "tesla" ? " is-active" : ""}" data-workspace-brand="tesla" aria-pressed="${brand === "tesla"}">Tesla</button>
            <button type="button" class="workspace-brand-btn${brand === "rivian" ? " is-active" : ""}" data-workspace-brand="rivian" aria-pressed="${brand === "rivian"}">Rivian</button>
          </div>
          <div class="workspace-mode-toggle" role="tablist" aria-label="Workspace mode">
            <button type="button" role="tab" class="workspace-mode-btn${workspaceMode === "report" ? " is-active" : ""}" data-workspace-mode="report" aria-selected="${workspaceMode === "report"}">Development Report</button>
            <button type="button" role="tab" class="workspace-mode-btn${workspaceMode === "images" ? " is-active" : ""}" data-workspace-mode="images" aria-selected="${workspaceMode === "images"}">Image Review</button>
            <button type="button" role="tab" class="workspace-mode-btn${workspaceMode === "history" ? " is-active" : ""}" data-workspace-mode="history" aria-selected="${workspaceMode === "history"}">History</button>
            <button type="button" role="tab" class="workspace-mode-btn${workspaceMode === "time" ? " is-active" : ""}" data-workspace-mode="time" aria-selected="${workspaceMode === "time"}">Dev Time</button>
            <button type="button" role="tab" class="workspace-mode-btn${workspaceMode === "tokens" ? " is-active" : ""}" data-workspace-mode="tokens" aria-selected="${workspaceMode === "tokens"}">Token Usage</button>
          </div>
        </div>
        <div class="admin-workspace-window-actions">
          <button type="button" class="admin-backup-btn" data-history-backup ${
            historyBackupState.state === "loading" || historyRestoreState.state === "loading"
              ? "disabled"
              : ""
          } aria-busy="${historyBackupState.state === "loading" ? "true" : "false"}" aria-label="Backup current version to GitHub">${
            historyBackupState.state === "loading" ? "Backing up…" : "Backup to GitHub"
          }</button>
          <button type="button" class="workspace-close-btn" data-close-workspace aria-label="Close window" title="Close window"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 7.2 16.8 16.8M16.8 7.2 7.2 16.8" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round"/></svg></button>
        </div>
      </div>
      ${mock ? `<p class="admin-mock-flag">Development mock — not production security</p>` : ""}
      ${
        historyBackupState.message
          ? `<p class="admin-workspace-backup-status" role="status">${escapeHtml(historyBackupState.message)}${
              historyBackupState.commitSha
                ? historyBackupState.backupUrl
                  ? ` · <a href="${escapeHtml(historyBackupState.backupUrl)}" target="_blank" rel="noopener">${escapeHtml(
                      String(historyBackupState.commitSha).slice(0, 7)
                    )}</a>`
                  : ` · ${escapeHtml(String(historyBackupState.commitSha).slice(0, 7))}`
                : ""
            }</p>`
          : ""
      }
    </div>`;
  workspaceModeHost.querySelectorAll("[data-workspace-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setWorkspaceMode(btn.dataset.workspaceMode));
  });
  workspaceModeHost.querySelectorAll("[data-workspace-brand]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.workspaceBrand;
      if (next === brand) return;
      loadBrand(next, { quiet: workspaceMode !== "chart" });
    });
  });
  workspaceModeHost.querySelector("[data-close-workspace]")?.addEventListener("click", () => {
    setWorkspaceMode("chart");
  });
  workspaceModeHost.querySelector("[data-history-backup]")?.addEventListener("click", async () => {
    if (historyBackupState.state === "loading" || historyRestoreState.state === "loading") return;
    historyBackupState = { state: "loading", message: "Backing up…" };
    renderAdminWorkspaceView();
    const result = await postAdminHistoryBackup(historyView.currentVersionLabel);
    historyBackupState = {
      state: result.ok ? result.state || "success" : "error",
      message: result.message || (result.ok ? "Backup complete." : "Backup failed."),
      commitSha: result.commitSha,
      backupUrl: result.backupUrl,
    };
    await loadHistoryView();
    if (workspaceMode !== "history") renderAdminWorkspaceView();
  });
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function clearWorkspaceLayoutInline() {
  workspaceLayoutGen += 1;
  if (workspaceLayoutTimer) {
    window.clearTimeout(workspaceLayoutTimer);
    workspaceLayoutTimer = 0;
  }
  if (!chartPanel) return;
  chartPanel.style.height = "";
  chartPanel.style.overflow = "";
  chartPanel.style.transition = "";
  document.body.classList.remove("admin-workspace-collapsing", "admin-workspace-expanding");
}

function setHeroInert(expanded) {
  if (!heroShell) return;
  if (expanded) heroShell.setAttribute("inert", "");
  else heroShell.removeAttribute("inert");
}

function animateWorkspacePanel(startHeight, afterPaint, { expanding = false } = {}) {
  const panel = chartPanel;
  const gen = ++workspaceLayoutGen;
  if (!panel) {
    afterPaint?.();
    return;
  }
  let endHeight = panel.getBoundingClientRect().height;
  if (expanding) {
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    endHeight = Math.max(endHeight, window.innerHeight - 7.5 * rootPx);
  }
  if (!startHeight || Math.abs(startHeight - endHeight) < 2) {
    document.body.classList.remove("admin-workspace-collapsing", "admin-workspace-expanding");
    afterPaint?.();
    return;
  }
  panel.style.transition = "none";
  panel.style.height = `${startHeight}px`;
  panel.style.overflow = "hidden";
  panel.getBoundingClientRect();
  let finished = false;
  const finish = () => {
    if (finished || gen !== workspaceLayoutGen) return;
    finished = true;
    panel.removeEventListener("transitionend", onEnd);
    if (workspaceLayoutTimer) {
      window.clearTimeout(workspaceLayoutTimer);
      workspaceLayoutTimer = 0;
    }
    panel.style.height = "";
    panel.style.overflow = "";
    panel.style.transition = "";
    document.body.classList.remove("admin-workspace-collapsing", "admin-workspace-expanding");
    afterPaint?.();
  };
  const onEnd = (event) => {
    if (event.target !== panel || event.propertyName !== "height") return;
    finish();
  };
  panel.addEventListener("transitionend", onEnd);
  requestAnimationFrame(() => {
    if (gen !== workspaceLayoutGen) return;
    panel.style.transition = "height 0.52s cubic-bezier(0.22, 1, 0.36, 1)";
    panel.style.height = `${endHeight}px`;
  });
  workspaceLayoutTimer = window.setTimeout(finish, 750);
}

function isWorkplaceMode(mode) {
  return mode === "report" || mode === "images" || mode === "history" || mode === "time" || mode === "tokens";
}

function workspaceAriaLabel(mode) {
  if (mode === "report") return "Development Report";
  if (mode === "history") return "Development History";
  if (mode === "time") return "Development Time";
  if (mode === "tokens") return "Token Usage";
  return "Image Review";
}

function setWorkspaceMode(next) {
  if (!isAdminAuthenticated() && next !== "chart") return;
  const prev = workspaceMode;
  const nextMode = isWorkplaceMode(next) ? next : "chart";
  if (prev === nextMode) return;
  workspaceMode = nextMode;
  const expanding = prev === "chart" && nextMode !== "chart";
  const collapsing = prev !== "chart" && nextMode === "chart";
  const animate = (expanding || collapsing) && !prefersReducedMotion();
  const startHeight = animate ? chartPanel?.getBoundingClientRect().height || 0 : 0;

  clearWorkspaceLayoutInline();
  document.body.classList.toggle("admin-workspace-expanded", nextMode !== "chart");
  setHeroInert(nextMode !== "chart");
  if (collapsing) document.body.classList.add("admin-workspace-collapsing");
  if (expanding) document.body.classList.add("admin-workspace-expanding");
  if (collapsing || expanding) window.scrollTo({ top: 0, behavior: animate ? "smooth" : "auto" });

  render();
  if (nextMode === "history") loadHistoryView();
  if (nextMode === "time" || nextMode === "tokens") loadUsageView();
  if (!animate) {
    document.body.classList.remove("admin-workspace-collapsing", "admin-workspace-expanding");
    return;
  }
  animateWorkspacePanel(
    startHeight,
    () => {
      chartWrap?.classList.remove("is-workspace-enter");
    },
    { expanding }
  );
  if (chartWrap) {
    chartWrap.classList.add("is-workspace-enter");
  }
}

async function loadAdminOverlays() {
  if (!isAdminAuthenticated()) {
    adminOverlays = { candidates: [], decisions: [] };
    return;
  }
  const result = await fetchAdminOverlays();
  if (!result.ok) return;
  adminOverlays = {
    candidates: result.candidates || [],
    decisions: result.decisions || [],
  };
}

function groupToReviewRow(group) {
  const id = group.featureIds?.[0] || group.title;
  const raw = (data?.features || []).find((f) => f.id === id) || {};
  const canonical = {
    ...raw,
    id,
    title: group.title,
    description: group.description,
    image: group.image,
    imageDark: group.imageDark,
    models: group.models,
    categories: group.categories,
    links: group.links,
    version: group.releases?.[0]?.version || raw.version,
    releaseDate: group.releases?.[0]?.releaseDate || raw.releaseDate,
    releaseUrl: group.releases?.[0]?.releaseUrl || raw.releaseUrl,
  };
  const meta = scoreFeature(canonical);
  return {
    ...meta,
    id,
    featureIds: group.featureIds || [],
    title: group.title,
    brand: BRAND_META[brand].label,
    models: group.models || [],
    category: group.categories?.[0] || "",
    version: canonical.version,
    releaseDate: canonical.releaseDate,
    group,
  };
}

function currentReviewRows() {
  return filteredGroups().map(groupToReviewRow);
}

function currentImageItems() {
  const decisions = new Map((adminOverlays.decisions || []).map((d) => [d.featureId, d]));
  return currentReviewRows()
    .filter((row) => !row.hasImage || decisions.has(row.id))
    .map((row) => ({
      ...row,
      candidates: (adminOverlays.candidates || []).filter((c) => c.featureId === row.id),
      decision: decisions.get(row.id) || null,
    }));
}

function bindAdminWorkspace(root) {
  root.querySelectorAll("[data-admin-filter]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const key = sel.dataset.adminFilter;
      if (workspaceMode === "report") {
        reportExtra = { ...reportExtra, [key]: sel.value };
      } else if (workspaceMode === "history") {
        historyExtra = { ...historyExtra, [key]: sel.value };
        loadHistoryView();
        return;
      } else if (workspaceMode === "time" || workspaceMode === "tokens") {
        return;
      } else {
        imageExtra = { ...imageExtra, [key]: sel.value };
      }
      renderAdminWorkspaceView();
    });
  });
  root.querySelector("[data-admin-sort]")?.addEventListener("change", (e) => {
    imageSort = e.target.value;
    renderAdminWorkspaceView();
  });
  root.querySelectorAll("[data-open-feature]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.openFeature;
      const row = currentReviewRows().find((r) => r.id === id);
      if (row?.group) mountAndExpandFeatureCard(row.group);
    });
  });
  root.querySelectorAll("[data-recommend]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.recommend;
      const current = agentStateById[id] || { state: "idle" };
      if (current.open) {
        agentStateById = { ...agentStateById, [id]: { ...current, open: false } };
        renderAdminWorkspaceView();
        return;
      }
      const closedOthers = Object.fromEntries(
        Object.entries(agentStateById).map(([key, value]) => [key, { ...value, open: false }])
      );
      if (current.message && current.state !== "loading") {
        agentStateById = { ...closedOthers, [id]: { ...current, open: true } };
        renderAdminWorkspaceView();
        return;
      }
      agentStateById = {
        ...closedOthers,
        [id]: { ...current, state: "loading", open: true },
      };
      renderAdminWorkspaceView();
      const row = currentReviewRows().find((r) => r.id === id);
      const result = await postAdminRecommend({
        featureId: id,
        feature: row,
        reviewMetadata: row,
      });
      const latest = agentStateById[id] || {};
      agentStateById = {
        ...agentStateById,
        [id]: {
          ...latest,
          state: result.state || (result.ok ? "success" : "error"),
          message: result.message || "",
          open: latest.open !== false,
        },
      };
      renderAdminWorkspaceView();
    });
  });
  root.querySelectorAll("[data-select-feature]").forEach((box) => {
    box.addEventListener("change", () => {
      const id = box.dataset.selectFeature;
      if (box.checked) selectedImageIds.add(id);
      else selectedImageIds.delete(id);
      renderAdminWorkspaceView();
    });
  });
  root.querySelector("[data-batch='placeholder']")?.addEventListener("click", async () => {
    if (!selectedImageIds.size) return;
    for (const id of selectedImageIds) {
      await postAdminDecision({
        featureId: id,
        featureIds: currentReviewRows().find((r) => r.id === id)?.featureIds || [id],
        brand,
        status: "placeholder",
      });
    }
    selectedImageIds = new Set();
    await loadAdminOverlays();
    renderAdminWorkspaceView();
  });
  root.querySelectorAll(".admin-candidate").forEach((fig) => {
    fig.addEventListener("click", () => {
      const card = fig.closest("[data-feature-id]");
      const featureId = card?.dataset.featureId;
      if (!featureId) return;
      selectedCandidateByFeature[featureId] = fig.dataset.candidate;
      card.querySelectorAll(".admin-candidate").forEach((el) => {
        el.classList.toggle("is-selected", el === fig);
      });
    });
  });
  root.querySelectorAll("[data-image-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest("[data-feature-id]");
      const featureId = card?.dataset.featureId;
      if (!featureId) return;
      const action = btn.dataset.imageAction;
      const live = card.querySelector("[data-live]");
      const row = currentReviewRows().find((r) => r.id === featureId);
      if (action === "search") {
        const result = await postAdminImageSearch({ featureId });
        if (live) live.textContent = result.message || "Agent not configured";
        return;
      }
      if (action === "generate") {
        const result = await postAdminImageGenerate({ featureId, reason: "backup" });
        if (live) live.textContent = result.message || "Agent not configured";
        return;
      }
      const candidateId = selectedCandidateByFeature[featureId];
      const status =
        action === "primary" || action === "secondary"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : action === "placeholder"
              ? "placeholder"
              : "needs-review";
      const payload = {
        featureId,
        featureIds: row?.featureIds || [featureId],
        brand,
        status,
      };
      if (action === "primary") payload.primaryCandidate = candidateId;
      if (action === "secondary") payload.secondaryCandidate = candidateId;
      const result = await postAdminDecision(payload);
      if (live) {
        live.textContent =
          status === "approved"
            ? "Approved for production image overlay"
            : status === "rejected"
              ? "Rejected"
              : status === "placeholder"
                ? "Placeholder recorded"
                : "Marked needs review";
      }
      await loadAdminOverlays();
      if (result.edits) await loadBrand(brand, { quiet: true });
      renderAdminWorkspaceView();
    });
  });
  root.querySelectorAll("[data-history-undo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.historyUndo;
      const event = (historyView.items || []).find((item) => item.id === id);
      openAdminDialog({
        title: "Restore this version?",
        body: `The current design overlay will be restored to <strong>${escapeHtml(
          event?.versionLabel || "this version"
        )}</strong>. This creates a new history entry and does not delete previous versions.`,
        primaryLabel: "Restore",
        onPrimary: async () => {
          historyRestoreState = { state: "loading", message: "Restoring…" };
          renderAdminWorkspaceView();
          const result = await postAdminHistoryRestore(id);
          if (!result.ok) {
            historyRestoreState = {
              state: "error",
              message: result.message || "Restore failed. The current design was left unchanged.",
            };
            renderAdminWorkspaceView();
            openAdminDialog({
              title: "Restore failed",
              body: escapeHtml(result.message || "The current design was left unchanged."),
              primaryLabel: "OK",
              onPrimary: closeAdminDialog,
            });
            return;
          }
          historyRestoreState = {
            state: "success",
            message: `Restored ${event?.versionLabel || "the selected version"}. A new history entry was created.`,
          };
          await loadBrand(brand, { quiet: true, bustCache: true });
          await loadHistoryView();
        },
      });
    });
  });
}

function renderAdminWorkspaceView() {
  if (!chartWrap || !isAdminAuthenticated()) return;
  renderWorkspaceModeBar();
  chartPanel.hidden = false;
  chartPanel.classList.remove("is-detail", "is-cards-layout", "is-list-layout");
  chartTitle.textContent = "";
  chartTitle.hidden = true;
  chartSubtitle.textContent = "";
  chartSubtitle.hidden = true;
  chartTotal.innerHTML = "";
  chartWrap.setAttribute("aria-label", workspaceAriaLabel(workspaceMode));
  if (workspaceMode === "report") {
    chartWrap.innerHTML = renderDevelopmentReportHtml({
      rows: currentReviewRows(),
      extra: reportExtra,
      agentStateById,
    });
  } else if (workspaceMode === "history") {
    chartWrap.innerHTML = renderDevelopmentHistoryHtml({
      extra: historyExtra,
      page: historyView,
      backupState: historyBackupState,
      restoreState: historyRestoreState,
    });
  } else if (workspaceMode === "time") {
    chartWrap.innerHTML = renderDevelopmentTimeHtml({ report: usageView });
  } else if (workspaceMode === "tokens") {
    chartWrap.innerHTML = renderTokenUsageHtml({ report: usageView });
  } else {
    chartWrap.innerHTML = renderImageReviewHtml({
      items: currentImageItems(),
      extra: imageExtra,
      sort: imageSort,
      selectedIds: [...selectedImageIds],
    });
  }
  bindAdminWorkspace(chartWrap);
}

async function loadHistoryView() {
  if (!isAdminAuthenticated()) return;
  const result = await fetchAdminHistory({ ...historyExtra });
  if (result.status === 401 || result.status === 403) {
    historyView = { items: [], total: 0 };
    historyBackupState = {
      state: "error",
      message: "Not authorized to view development history.",
    };
  } else if (result.items) {
    historyView = result;
  } else if (result.status >= 400) {
    historyBackupState = {
      state: "error",
      message: result.message || "Could not load development history.",
    };
  }
  if (workspaceMode === "history") renderAdminWorkspaceView();
}

async function loadUsageView() {
  if (!isAdminAuthenticated()) return;
  const result = await fetchAdminUsage();
  if (result.status === 401 || result.status === 403) {
    usageView = {
      ok: false,
      message: "Not authorized to view development usage.",
    };
  } else if (result.ok) {
    usageView = result;
  } else {
    usageView = {
      ok: false,
      message: result.message || "Could not load development usage.",
    };
  }
  if (workspaceMode === "time" || workspaceMode === "tokens") renderAdminWorkspaceView();
}

function handleAdminImageKeys(e) {
  if (workspaceMode !== "images" || !isAdminAuthenticated()) return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  const cards = [...document.querySelectorAll(".admin-image-card")];
  if (!cards.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowRight") {
    e.preventDefault();
    imageFocusIndex = Math.min(cards.length - 1, imageFocusIndex + 1);
    cards[imageFocusIndex].focus();
  } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
    e.preventDefault();
    imageFocusIndex = Math.max(0, imageFocusIndex - 1);
    cards[imageFocusIndex].focus();
  }
  const card = cards[imageFocusIndex] || document.activeElement?.closest?.(".admin-image-card");
  if (!card) return;
  const cands = [...card.querySelectorAll(".admin-candidate")];
  if (e.key >= "1" && e.key <= "3") {
    const fig = cands[Number(e.key) - 1];
    fig?.click();
  }
  const map = { p: "primary", s: "secondary", r: "reject", n: "needs-review" };
  const action = map[e.key.toLowerCase()];
  if (action) {
    card.querySelector(`[data-image-action="${action}"]`)?.click();
  }
}

function updateChartModeToggle() {
  if (!chartModeBar) return;
  const show = brand === "tesla" && !(isAdminAuthenticated() && workspaceMode !== "chart");
  chartModeBar.hidden = !show;
  if (!show) return;
  chartModeBar.querySelectorAll("[data-chart-view]").forEach((btn) => {
    const active = btn.dataset.chartView === chartView;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setChartView(next) {
  if (next !== "frequency" && next !== "milestone" && next !== "revenue-simulator") return;
  if (chartView === next) return;
  chartView = next;
  if (next === "milestone" || next === "revenue-simulator") {
    chartDrill = null;
    document.body.classList.remove("detail-list-mode", "detail-cards-mode");
  }
  if (next === "revenue-simulator") {
    digitalRevenueDraft = loadSimulatorDraft();
  }
  render();
}

function drsRoot() {
  return chartWrap?.querySelector(".drs-view") ?? null;
}

function refreshDigitalRevenueOutputs() {
  digitalRevenueDraft = normalizeDraft(digitalRevenueDraft);
  const state = draftToState(digitalRevenueDraft);
  const metrics = computeSimulatorMetrics(state);
  const root = drsRoot();
  if (root) patchDigitalRevenueOutputs(root, metrics, state, digitalRevenueDraft);
  return { state, metrics };
}

function isSimulatorField(el) {
  return el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}

function applyDigitalRevenueField(el) {
  if (!isSimulatorField(el)) return;
  const field = el.getAttribute("data-drs-field");
  if (!field) return;
  const value = el.value;
  if (field === "hardware") {
    digitalRevenueDraft.hardwareInvestmentPerVehicle = value;
    return;
  }
  const yearId = el.getAttribute("data-drs-year-id");
  const featureId = el.getAttribute("data-drs-feature-id");
  if (field === "fleet" && yearId) {
    const year = digitalRevenueDraft.years.find((y) => y.id === yearId);
    if (year) year.fleet = value;
    return;
  }
  const feature = digitalRevenueDraft.features.find((f) => f.id === featureId);
  if (!feature) return;
  if (field === "feature-name") {
    feature.name = value;
    return;
  }
  if (!yearId) return;
  if (field === "price") feature.prices[yearId] = value;
  if (field === "adoption") feature.adoptions[yearId] = value;
}

function syncDigitalRevenueDraftFromDom() {
  const root = drsRoot();
  if (!root) return;
  root.querySelectorAll("[data-drs-field]").forEach((el) => {
    if (el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) applyDigitalRevenueField(el);
  });
}

function closeDigitalRevenueDeletePrompts() {
  if (!chartWrap) return;
  chartWrap.querySelectorAll(".drs-year-head-wrap.is-open, .drs-feature-name-card.is-open").forEach((el) => {
    el.classList.remove("is-open");
    el.querySelector(".drs-year-head")?.setAttribute("aria-expanded", "false");
  });
}

function openConnectivityInfo() {
  closeFeatureDetails();
  const modal = chartWrap?.querySelector(".drs-info-modal:not(.drs-fsd-modal):not(.drs-grok-modal):not(.drs-grok-heavy-modal):not(.drs-service-modal)");
  if (!modal) return;
  modal.hidden = false;
}

function openFsdInfo() {
  closeFeatureDetails();
  const modal = chartWrap?.querySelector(".drs-fsd-modal");
  if (!modal) return;
  modal.hidden = false;
}

function openGrokInfo() {
  closeFeatureDetails();
  const modal = chartWrap?.querySelector(".drs-grok-modal");
  if (!modal) return;
  modal.hidden = false;
}

function openGrokHeavyInfo() {
  closeFeatureDetails();
  const modal = chartWrap?.querySelector(".drs-grok-heavy-modal");
  if (!modal) return;
  modal.hidden = false;
}

function openServiceInfo() {
  closeFeatureDetails();
  const modal = chartWrap?.querySelector(".drs-service-modal");
  if (!modal) return;
  modal.hidden = false;
}

function closeFeatureDetails() {
  chartWrap?.querySelectorAll(".drs-info-modal").forEach((modal) => {
    modal.hidden = true;
  });
}

function closeConnectivityInfo() {
  closeFeatureDetails();
}

function syncDigitalRevenueScrollbars() {
  const features = chartWrap?.querySelector(".drs-features");
  const view = chartWrap?.querySelector(".drs-view");
  if (!features || !view) return;

  const cards = [...features.querySelectorAll(":scope > .drs-feature")];
  if (cards.length > 5) {
    features.classList.add("is-feature-scroll");
    features.style.maxHeight = "none";
    const listTop = features.getBoundingClientRect().top;
    const fifthBottom = cards[4].getBoundingClientRect().bottom;
    features.style.maxHeight = `${Math.ceil(fifthBottom - listTop)}px`;
  } else {
    features.classList.remove("is-feature-scroll");
    features.style.maxHeight = "";
  }

  const yearRow = chartWrap.querySelector(".drs-year-scrollbar-row");
  if (yearRow) yearRow.classList.toggle("is-visible", (digitalRevenueDraft?.years?.length || 0) > 4);

  const gutter = Math.max(0, features.offsetWidth - features.clientWidth);
  view.style.setProperty("--drs-features-gutter", `${gutter}px`);
}

function syncDigitalRevenueColumnGutter() {
  syncDigitalRevenueScrollbars();
}

function bindDigitalRevenueSimulatorEvents() {
  if (drsSimulatorBound || !chartWrap) return;
  drsSimulatorBound = true;
  if (typeof ResizeObserver !== "undefined") {
    const gutterObserver = new ResizeObserver(() => syncDigitalRevenueColumnGutter());
    gutterObserver.observe(chartWrap);
  }
  chartWrap.addEventListener("scroll", (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !t.classList.contains("drs-year-strip-main")) return;
    if (t.dataset.drsSyncing === "1") return;
    const left = t.scrollLeft;
    chartWrap.querySelectorAll(".drs-year-strip-main").forEach((el) => {
      if (el === t || el.scrollLeft === left) return;
      el.dataset.drsSyncing = "1";
      el.scrollLeft = left;
      delete el.dataset.drsSyncing;
    });
  }, true);
  chartWrap.addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !t.closest(".drs-view")) return;
    if (!isSimulatorField(t)) return;
    if (!t.getAttribute("data-drs-field")) return;
    syncDigitalRevenueDraftFromDom();
    saveSimulatorDraft(digitalRevenueDraft);
    refreshDigitalRevenueOutputs();
  });
  chartWrap.addEventListener("click", (e) => {
    if (chartView !== "revenue-simulator") return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const detailCard = t.closest("[data-drs-detail]");
    if (detailCard instanceof HTMLElement) {
      const nameField = detailCard.querySelector(".drs-feature-name-input");
      if (!(nameField instanceof HTMLInputElement) || nameField.readOnly) {
        const kind = detailCard.getAttribute("data-drs-detail");
        if (kind === "fsd") openFsdInfo();
        else if (kind === "grok") openGrokInfo();
        else if (kind === "grok-heavy") openGrokHeavyInfo();
        else if (kind === "service") openServiceInfo();
        else openConnectivityInfo();
        return;
      }
    }
    const btn = t.closest("[data-drs-action]");
    if (!btn) {
      closeDigitalRevenueDeletePrompts();
      return;
    }
    const action = btn.getAttribute("data-drs-action");
    if (action === "prompt-delete-year") {
      const wrap = btn.closest(".drs-year-head-wrap");
      const wasOpen = wrap?.classList.contains("is-open");
      closeDigitalRevenueDeletePrompts();
      if (!wasOpen && wrap) {
        wrap.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
      }
      return;
    }
    if (action === "prompt-delete-feature") {
      if (t.closest("input")) return;
      const card = btn.closest(".drs-feature-name-card");
      const wasOpen = card?.classList.contains("is-open");
      closeDigitalRevenueDeletePrompts();
      if (!wasOpen && card) card.classList.add("is-open");
      return;
    }
    if (action === "delete-feature") {
      const featureId = btn.getAttribute("data-drs-feature-id");
      if (!featureId || isBuiltInFeature(featureId)) return;
      removeFeature(digitalRevenueDraft, featureId);
      saveSimulatorDraft(digitalRevenueDraft);
      renderDigitalRevenueSimulator();
      return;
    }
    if (action === "delete-year") {
      const yearId = btn.getAttribute("data-drs-year-id");
      if (!yearId || isDefaultYear(yearId) || btn.hasAttribute("disabled")) return;
      removeYear(digitalRevenueDraft, yearId);
      saveSimulatorDraft(digitalRevenueDraft);
      renderDigitalRevenueSimulator();
      return;
    }
    if (action === "add-year") {
      if (digitalRevenueDraft.years.length >= DRS_MAX_YEARS) return;
      appendYear(digitalRevenueDraft, digitalRevenueDraft.years.length + 1);
      saveSimulatorDraft(digitalRevenueDraft);
      renderDigitalRevenueSimulator();
      return;
    }
    if (action === "add-feature") {
      appendFeature(digitalRevenueDraft);
      saveSimulatorDraft(digitalRevenueDraft);
      renderDigitalRevenueSimulator();
      return;
    }
    if (action === "reset-scenario") {
      digitalRevenueDraft = defaultSimulatorDraft();
      saveSimulatorDraft(digitalRevenueDraft);
      renderDigitalRevenueSimulator();
      return;
    }
    if (action === "feature-info") {
      openConnectivityInfo();
      return;
    }
    if (action === "close-feature-info") {
      closeConnectivityInfo();
      return;
    }
    if (action === "edit-page-content") {
      const dialog = btn.closest(".drs-info-dialog, .drs-fsd-dialog");
      if (!(dialog instanceof HTMLElement)) return;
      const editing = dialog.classList.toggle("is-editing");
      const fields = dialog.classList.contains("drs-fsd-dialog")
        ? dialog.querySelectorAll(".drs-fsd-title, p, h3, h4")
        : dialog.querySelectorAll(".drs-info-title, .drs-info-colhead, .drs-info-section, .drs-info-name");
      fields.forEach((el) => {
        if (editing) el.setAttribute("contenteditable", "true");
        else el.removeAttribute("contenteditable");
      });
      dialog.querySelectorAll("a").forEach((link) => {
        if (!(link instanceof HTMLAnchorElement)) return;
        if (editing) {
          if (!link.dataset.drsHref) link.dataset.drsHref = link.getAttribute("href") || "";
          link.removeAttribute("href");
        } else if (link.dataset.drsHref) {
          link.setAttribute("href", link.dataset.drsHref);
          delete link.dataset.drsHref;
        }
      });
      btn.setAttribute("aria-pressed", editing ? "true" : "false");
      if (editing) fields[0]?.focus();
      return;
    }
  });
  chartWrap.addEventListener("mousedown", (e) => {
    const input = e.target instanceof Element ? e.target.closest(".drs-feature-name-input") : null;
    if (!(input instanceof HTMLInputElement)) return;
    const card = input.closest(".drs-feature-name-card.has-detail");
    if (!card || !input.readOnly) return;
    e.preventDefault();
  });
  chartWrap.addEventListener("focusout", (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (!input.classList.contains("drs-feature-name-input")) return;
    if (!input.closest(".drs-feature-name-card.has-detail")) return;
    input.readOnly = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || chartView !== "revenue-simulator") return;
    closeConnectivityInfo();
  });
}

function renderDigitalRevenueSimulator() {
  chartPanel.hidden = false;
  chartPanel.classList.remove("is-detail", "is-cards-layout", "is-list-layout", "is-milestone");
  chartPanel.classList.add("is-revenue-simulator");
  chartWrap.classList.remove("is-fading-out", "is-zooming", "is-workspace-enter");
  chartTitle.hidden = true;
  chartSubtitle.hidden = true;
  chartTotal.textContent = "";
  if (chartHeaderActions) chartHeaderActions.innerHTML = "";
  if (resultMeta) resultMeta.hidden = true;

  digitalRevenueDraft = normalizeDraft(digitalRevenueDraft);
  const state = draftToState(digitalRevenueDraft);
  const metrics = computeSimulatorMetrics(state);
  chartWrap.innerHTML = renderDigitalRevenueSimulatorHtml(digitalRevenueDraft, metrics, state);
  syncDigitalRevenueColumnGutter();
  chartWrap.setAttribute("role", "region");
  chartWrap.setAttribute("aria-label", "Digital Revenue");
  chartWrap.removeAttribute("aria-labelledby");
  bindDigitalRevenueSimulatorEvents();
}

async function ensureTeslaMilestones() {
  if (teslaMilestonesDoc) return teslaMilestonesDoc;
  try {
    const res = await fetch("./data/tesla-milestones.json", { cache: "no-store" });
    if (!res.ok) return null;
    teslaMilestonesDoc = await res.json();
    return teslaMilestonesDoc;
  } catch {
    return null;
  }
}

function renderMilestoneItemHtml(item, yearLabel) {
  const isLaunch = item.kind === "model-launch";
  return `
    <article class="milestone-item${isLaunch ? " is-launch" : ""}">
      <div class="milestone-year">${yearLabel}</div>
      <div class="milestone-rail" aria-hidden="true"><span class="milestone-dot${isLaunch ? " is-launch" : ""}"></span></div>
      <div class="milestone-body">
        <div class="milestone-heading">
          <span class="milestone-version">${escapeHtml(item.version)}</span>
          ${
            item.significance
              ? `<p class="milestone-significance">${escapeHtml(item.significance)}</p>`
              : ""
          }
        </div>
        ${
          !isLaunch && item.detail
            ? `<p class="milestone-copy">${escapeHtml(item.detail)}</p>`
            : ""
        }
        ${
          !isLaunch && item.features?.length
            ? `<div class="milestone-features">${item.features
                .map((name) => `<span class="milestone-chip">${escapeHtml(name)}</span>`)
                .join("")}</div>`
            : ""
        }
      </div>
    </article>`;
}

function formatLaunchDateCell(cell) {
  const text = String(cell || "");
  const match = text.match(
    /^((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\.?\s*(.*)$/
  );
  if (!match) return escapeHtml(text);
  const rest = match[2] ? `<br>${escapeHtml(match[2])}` : "";
  return `<span class="sorp-launch-date">${escapeHtml(match[1])}</span>${rest}`;
}

function sorpModelSwitchButton(label, value, active) {
  return `<button type="button" class="sorp-model-tab${active ? " is-active" : ""}" data-sorp-model="${escapeHtml(value)}" aria-pressed="${active ? "true" : "false"}">${escapeHtml(label)}</button>`;
}

function bindSorpModelSwitch(root) {
  root.querySelectorAll("[data-sorp-model]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.sorpModel;
      if (!modelSelect || !next || !isValidVehicleModel(brand, next) || modelSelect.value === next) return;
      modelSelect.value = next;
      modelSelect.dispatchEvent(new Event("change"));
    });
  });
}

function renderSorpTableHtml(columns, rows, extraClass = "") {
  const sorpColumns =
    columns?.length > 0 ? columns : ["Category", "Initial SOP feature"];
  const isAllModels = String(extraClass).includes("is-all-models");
  const activeModel = selectedVehicleModel();
  const tableHead = sorpColumns
    .map((col, index) => {
      if (!isAllModels) return `<th>${escapeHtml(col)}</th>`;
      if (index === 0) {
        return `<th class="sorp-model-head">${sorpModelSwitchButton("Overview", "all", activeModel === "all")}</th>`;
      }
      const modelValue = vehicleModelOptionsForBrand(brand).find((option) => option.label === col)?.value;
      if (modelValue && modelValue !== "all") {
        return `<th class="sorp-model-head">${sorpModelSwitchButton(col, modelValue, activeModel === modelValue)}</th>`;
      }
      return `<th class="sorp-model-head"><span class="sorp-model-tab">${escapeHtml(col)}</span></th>`;
    })
    .join("");
  const tableRows = (rows || [])
    .map((row) => {
      const cells =
        Array.isArray(row.cells) && row.cells.length
          ? [...row.cells]
          : [row.category, row.detail];
      while (cells.length < sorpColumns.length) cells.push("");
      const launchDate = row.category === "Launch date";
      return `<tr>${cells
        .slice(0, sorpColumns.length)
        .map((cell, index) => {
          const html = launchDate && index > 0 ? formatLaunchDateCell(cell) : escapeHtml(cell);
          return index === 0
            ? `<th scope="row">${html}</th>`
            : `<td>${html}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");
  if (!tableRows) return `<p class="milestone-empty">No SORP feature list for this category.</p>`;
  const wideClass = sorpColumns.length > 2 ? " is-wide" : "";
  return `<div class="sorp-table-wrap"><table class="sorp-table${wideClass}${extraClass}">
            <thead><tr>${tableHead}</tr></thead>
            <tbody>${tableRows}</tbody>
          </table></div>`;
}

function renderAllModelsMilestoneChart() {
  const overview = allModelsOverview(teslaMilestonesDoc);
  const years = groupOverviewMilestones(overview.milestones);
  const timeline = years
    .map(
      (group) => `
        <div class="milestone-year-group">
          ${group.items
            .map((item) => {
              const launchInYear = group.items.some((row) => row.kind === "model-launch");
              const showYear = launchInYear
                ? item.kind === "model-launch"
                : group.items[0] === item && item.version !== "Ongoing";
              const yearLabel = showYear ? escapeHtml(String(group.year)) : "";
              return renderMilestoneItemHtml(item, yearLabel);
            })
            .join("")}
        </div>`
    )
    .join("");

  chartWrap.innerHTML = `
    <div class="milestone-view">
      <section class="sorp-panel" aria-label="Tesla all models SORP features">
        <h3 class="sorp-title sorp-title--center">Tesla all models SORP feature</h3>
        ${renderSorpTableHtml(overview.sorp.columns, overview.sorp.rows, " is-all-models")}
      </section>
      <div class="milestone-timeline">${timeline}</div>
    </div>`;
  chartWrap.setAttribute("role", "region");
  chartWrap.setAttribute("aria-label", "Tesla OTA main milestones");
  chartWrap.removeAttribute("aria-labelledby");
  bindSorpModelSwitch(chartWrap);
}

function renderMilestoneChart() {
  chartPanel.hidden = false;
  chartPanel.classList.remove("is-detail", "is-cards-layout", "is-list-layout", "is-revenue-simulator");
  chartPanel.classList.add("is-milestone");
  chartWrap.classList.remove("is-fading-out", "is-zooming", "is-workspace-enter");
  chartTitle.hidden = true;
  chartSubtitle.hidden = true;
  chartTotal.textContent = "";
  if (chartHeaderActions) chartHeaderActions.innerHTML = "";
  if (resultMeta) resultMeta.hidden = false;
  applyDetailLayoutVisibility();

  if (!teslaMilestonesDoc) {
    chartWrap.innerHTML = `<p class="milestone-empty">Loading OTA milestones…</p>`;
    ensureTeslaMilestones().then((doc) => {
      if (chartView === "milestone" && doc) renderCharts();
      else if (chartView === "milestone") {
        chartWrap.innerHTML = `<p class="milestone-empty">OTA milestone data is not available.</p>`;
      }
    });
    return;
  }

  const model = selectedVehicleModel();
  if (model === "all") {
    renderAllModelsMilestoneChart();
    return;
  }

  const modelData = modelMilestoneData(teslaMilestonesDoc, model);
  const modelLabel = vehicleModelLabel(brand, model);
  if (!modelData) {
    chartWrap.innerHTML = `<p class="milestone-empty">No OTA milestone data for ${escapeHtml(modelLabel)}.</p>`;
    return;
  }

  const years = groupMilestonesByYear(modelData.milestones);
  const availableCats = SORP_CATEGORIES.filter(
    (c) => (modelData.sorp?.[c.id]?.rows || []).length
  );
  if (availableCats.length && !availableCats.some((c) => c.id === sorpCategoryId)) {
    sorpCategoryId = availableCats[0].id;
  }
  const activeCat =
    availableCats.find((c) => c.id === sorpCategoryId) || availableCats[0];
  const sorpRows = activeCat ? sorpRowsForCategory(modelData, activeCat.id) : [];

  const timeline = years.length
    ? years
        .map(
          (group) => `
        <div class="milestone-year-group">
          ${group.items
            .map(
              (item, index) => `
            <article class="milestone-item">
              <div class="milestone-year">${index === 0 ? escapeHtml(String(group.year)) : ""}</div>
              <div class="milestone-rail" aria-hidden="true"><span class="milestone-dot"></span></div>
              <div class="milestone-body">
                <div class="milestone-heading">
                  <span class="milestone-version">${escapeHtml(item.version)}</span>
                  ${
                    item.significance
                      ? `<p class="milestone-significance">${escapeHtml(item.significance)}</p>`
                      : ""
                  }
                </div>
                ${
                  item.features.length
                    ? `<div class="milestone-features">${item.features
                        .map((name) => `<span class="milestone-chip">${escapeHtml(name)}</span>`)
                        .join("")}</div>`
                    : ""
                }
              </div>
            </article>`
            )
            .join("")}
        </div>`
        )
        .join("")
    : `<p class="milestone-empty">No OTA milestones for ${escapeHtml(modelLabel)}.</p>`;

  const tabs = availableCats
    .map(
      (c) => `
      <button type="button" class="sorp-tab${c.id === activeCat.id ? " is-active" : ""}" data-sorp-cat="${escapeHtml(c.id)}" aria-pressed="${c.id === activeCat.id ? "true" : "false"}">${escapeHtml(c.label)}</button>`
    )
    .join("");

  const sorpBlock = activeCat ? modelData.sorp?.[activeCat.id] : null;
  const sorpColumns =
    sorpBlock?.columns?.length > 0
      ? sorpBlock.columns
      : ["Category", "Initial SOP feature"];
  const tableHead = sorpColumns
    .map((col, index) => `<th>${index === 0 && col === "Feature area" ? "" : escapeHtml(col)}</th>`)
    .join("");
  const tableRows = sorpRows
    .map((row) => {
      const cells = Array.isArray(row.cells) && row.cells.length
        ? [...row.cells]
        : [row.category, row.detail];
      while (cells.length < sorpColumns.length) cells.push("");
      return `<tr>${cells
        .slice(0, sorpColumns.length)
        .map(
          (cell, index) =>
            index === 0
              ? `<th scope="row">${escapeHtml(cell)}</th>`
              : `<td>${escapeHtml(cell)}</td>`
        )
        .join("")}</tr>`;
    })
    .join("");
  const wideClass = sorpColumns.length > 2 ? " is-wide" : "";

  chartWrap.innerHTML = `
    <div class="milestone-view">
      <section class="sorp-panel" aria-label="${escapeHtml(modelLabel)} SORP features">
        <div class="sorp-model-switch" role="tablist" aria-label="Model">
          ${sorpModelSwitchButton("Overview", "all", false)}
          ${["S", "X", "3", "Y", "CT"]
            .map((id) => sorpModelSwitchButton(vehicleModelLabel(brand, id), id, model === id))
            .join("")}
        </div>
        ${tabs ? `<div class="sorp-tabs" role="tablist">${tabs}</div>` : ""}
        ${
          tableRows
            ? `<div class="sorp-table-wrap"><table class="sorp-table${wideClass}">
                <thead><tr>${tableHead}</tr></thead>
                <tbody>${tableRows}</tbody>
              </table></div>`
            : `<p class="milestone-empty">No SORP feature list for this category.</p>`
        }
      </section>
      <div class="milestone-timeline">${timeline}</div>
    </div>`;
  chartWrap.setAttribute("role", "region");
  chartWrap.setAttribute("aria-label", `${modelLabel} OTA milestones`);
  chartWrap.removeAttribute("aria-labelledby");
  chartWrap.querySelectorAll("[data-sorp-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sorpCategoryId = btn.dataset.sorpCat;
      renderMilestoneChart();
    });
  });
  bindSorpModelSwitch(chartWrap);
}

function renderCharts() {
  renderWorkspaceModeBar();
  updateChartModeToggle();
  if (isAdminAuthenticated() && workspaceMode !== "chart") {
    document.body.classList.add("admin-workspace-expanded");
    setHeroInert(true);
    renderAdminWorkspaceView();
    return;
  }
  if (!document.body.classList.contains("admin-workspace-collapsing")) {
    document.body.classList.remove("admin-workspace-expanded");
    setHeroInert(false);
  }
  updateChartModeToggle();
  if (brand === "tesla" && chartView === "revenue-simulator") {
    renderDigitalRevenueSimulator();
    return;
  }
  if (brand === "tesla" && chartView === "milestone") {
    renderMilestoneChart();
    return;
  }

  chartTitle.hidden = false;
  chartWrap.setAttribute("role", "img");
  chartWrap.setAttribute("aria-labelledby", "chartTitle");
  chartWrap.removeAttribute("aria-label");

  // Month bar on the category+year timeline toggles filter; keep the chart visible.
  const monthToggleOnTimeline =
    chartDrill?.month != null &&
    yearSelect.value !== "all" &&
    categorySelect.value !== "all";

  if (chartDrill && !monthToggleOnTimeline && !isSearchActive()) {
    // Hide the SVG chart entirely while OTA details show in #results.
    chartPanel.classList.add("is-detail");
    chartPanel.classList.remove("has-month-selected", "is-milestone", "is-revenue-simulator");
    chartPanel.hidden = true;
    renderChartDetailList();
    return;
  }

  chartPanel.classList.remove(
    "is-detail",
    "is-cards-layout",
    "is-list-layout",
    "is-milestone",
    "is-revenue-simulator"
  );
  if (!monthToggleOnTimeline) chartPanel.classList.remove("has-month-selected");
  chartPanel.hidden = false;
  document.body.classList.remove("detail-list-mode", "detail-cards-mode");
  chartSubtitle.hidden = false;
  if (chartHeaderActions) chartHeaderActions.innerHTML = "";
  if (resultsEl) resultsEl.classList.remove("is-detail-list");
  if (resultMeta) resultMeta.hidden = false;
  applyDetailLayoutVisibility();
  const year = yearSelect.value;
  const cat = categorySelect.value;

  if (year !== "all" && cat !== "all") {
    renderCategoryInYearChart(cat, year);
    return;
  }
  if (year !== "all") {
    renderYearCategoryChart(year);
    return;
  }
  if (cat === "all") {
    renderAllYearsOtaChart();
    return;
  }
  renderCategoryByYearChart();
}

function renderChartDetailList() {
  chartPanel.classList.add("is-detail");
  chartPanel.hidden = true;
  chartDetailError = null;
  renderChartDetailChrome();
  applyDetailLayoutVisibility();

  chartTitle.textContent = "";
  chartSubtitle.textContent = "";
  chartSubtitle.hidden = true;
  chartTotal.innerHTML = "";
  chartWrap.innerHTML = "";
  chartDetailStatus = "ready";
}

function renderReleaseFooter(releases) {
  const primary = releases[0];
  const primaryDate = primary.releaseDate || "Date unknown";

  if (releases.length === 1) {
    return `
      <div class="card-footer">
        <span class="footer-version">${escapeHtml(primary.version)}</span>
        <span class="footer-date">${escapeHtml(primaryDate)}</span>
      </div>
    `;
  }

  const versionOptions = releases
    .map(
      (r, idx) =>
        `<option value="${idx}" ${idx === 0 ? "selected" : ""}>${escapeHtml(r.version)}</option>`
    )
    .join("");
  const dateOptions = releases
    .map((r, idx) => {
      const date = r.releaseDate || "Date unknown";
      return `<option value="${idx}" ${idx === 0 ? "selected" : ""}>${escapeHtml(date)}</option>`;
    })
    .join("");

  const payload = escapeHtml(JSON.stringify(releases));

  return `
    <div class="card-footer card-footer-multi" data-releases="${payload}">
      <label class="footer-select">
        <span class="sr-only">OTA version</span>
        <select class="footer-version-select" aria-label="OTA version">${versionOptions}</select>
      </label>
      <label class="footer-select footer-select-date">
        <span class="sr-only">Release date</span>
        <select class="footer-date-select" aria-label="Release date">${dateOptions}</select>
      </label>
    </div>
  `;
}

function bindFooterSelects(root) {
  root.querySelectorAll(".card-footer-multi").forEach((footer) => {
    let releases;
    try {
      releases = JSON.parse(footer.dataset.releases || "[]");
    } catch {
      return;
    }
    const versionSelectEl = footer.querySelector(".footer-version-select");
    const dateSelectEl = footer.querySelector(".footer-date-select");
    if (!versionSelectEl || !dateSelectEl) return;

    const sync = (idx) => {
      const i = Number(idx);
      if (!Number.isInteger(i) || !releases[i]) return;
      versionSelectEl.value = String(i);
      dateSelectEl.value = String(i);
    };

    versionSelectEl.addEventListener("change", () => sync(versionSelectEl.value));
    dateSelectEl.addEventListener("change", () => sync(dateSelectEl.value));
  });
}

function imageRotateClass(url) {
  if (!url) return "";
  // NotaTeslaApp "Down Under" FSD assets are stored upside down
  if (/fsd-supervised.*down-under/i.test(url)) return " is-rotated-180";
  return "";
}

function isUsefulFeatureImage(url) {
  if (!url) return false;
  if (/placeholder|rivian-wave-placeholder/i.test(url)) return false;
  // RivianTrackr only provides release-level posters / banners / OG art
  if (/riviantrackr\.com/i.test(url)) return false;
  if (/FeaturedOTA|Master-Banner|\/og-image(?:\.|$)/i.test(url)) return false;
  return true;
}

function availabilityClass(label) {
  const t = String(label || "").toLowerCase();
  if (/not relevant|unavailable|not available|unknown/.test(t)) {
    return "is-unavailable";
  }
  if (/available in the us\b/.test(t)) return "is-us";
  if (/worldwide|available|specific regions|more regions|tbd/.test(t)) {
    return "is-available";
  }
  return "";
}

function renderFeatureMeta(f) {
  const availability =
    brand === "tesla" && f.availability
      ? `<span class="meta-availability ${availabilityClass(f.availability)}">${escapeHtml(f.availability)}</span>`
      : "";
  const models = [...(f.models || [])];
  const modelsBlock = models.length
    ? `<div class="meta-models">${models
        .map((m) => `<span class="meta-model">${escapeHtml(m)}</span>`)
        .join("")}</div>`
    : "";
  if (!availability && !modelsBlock) return "";
  return `<div class="card-meta-row">${availability}${modelsBlock}</div>`;
}

function publicImageSrc(url) {
  const value = String(url || "");
  // Root-absolute /data/uploads/ 404s on GitHub Pages project sites.
  if (value.startsWith("/data/uploads/")) return `.${value}`;
  return value;
}

function renderMedia(url, alt, extraClass) {
  if (!url) {
    return `<div class="card-media ${extraClass} placeholder">No feature image</div>`;
  }
  const src = publicImageSrc(url);
  const rotateClass = imageRotateClass(url).trim();
  const classAttr = rotateClass ? ` class="${rotateClass}"` : "";
  return `<div class="card-media ${extraClass}"><img${classAttr} src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" /></div>`;
}

function cardHasUnsavedEdits(card) {
  return Boolean(card?.dataset?.dirty === "1");
}

function confirmDiscardEdits() {
  return window.confirm("Discard unsaved changes?");
}

function collapseExpandedCard({ force = false } = {}) {
  const expanded = document.querySelector(".card.is-expanded");
  if (!expanded) {
    cardBackdrop.hidden = true;
    document.body.classList.remove("card-expanded-open");
    return true;
  }
  if (!force && cardHasUnsavedEdits(expanded)) {
    if (!confirmDiscardEdits()) return false;
  }
  if (expanded.classList.contains("is-editing")) {
    exitCardEditMode(expanded, { restore: true, skipConfirm: true });
  }
  const fromOverlay = Boolean(expanded.closest("#featureDetailHost"));
  expanded.classList.remove("is-expanded", "is-morphing", "will-morph");
  expanded.style.transition = "";
  expanded.style.transform = "";
  expanded.style.opacity = "";
  cardBackdrop.hidden = true;
  document.body.classList.remove("card-expanded-open");
  if (fromOverlay) clearFeatureDetailHost();
  return true;
}

function getCardSnapshot(card) {
  let categories = [];
  try {
    categories = JSON.parse(card.dataset.categories || "[]");
  } catch {
    categories = [...card.querySelectorAll(".card-top .badge")].map((b) =>
      b.textContent.trim()
    );
  }
  let featureIds = [];
  try {
    featureIds = JSON.parse(card.dataset.featureIds || "[]");
  } catch {
    featureIds = [];
  }
  const descText = card.querySelector(".card-desc-text")?.textContent || "";
  const description =
    descText === "No description provided."
      ? ""
      : descText;
  return {
    title: card.querySelector(".card-title-view")?.textContent?.trim() || "",
    description,
    categories,
    image: card.dataset.image || "",
    imageDark: card.dataset.imageDark || "",
    featureIds,
  };
}

function setCardDirty(card, dirty) {
  card.dataset.dirty = dirty ? "1" : "0";
}

function renderCategoryBadges(categories, query = "") {
  return (categories || [])
    .map((c) => {
      const label = query ? highlightSearchHtml(c, query) : escapeHtml(c);
      return `<span class="badge">${label}</span>`;
    })
    .join("");
}

function updateCardViewFromState(card, state) {
  const titleEl = card.querySelector(".card-title-view");
  const descEl = card.querySelector(".card-desc-text");
  const catsEl = card.querySelector(".card-top");
  if (titleEl) titleEl.textContent = state.title;
  if (descEl) descEl.textContent = state.description || "No description provided.";
  if (catsEl) catsEl.innerHTML = renderCategoryBadges(state.categories);

  card.dataset.title = state.title;
  card.dataset.description = state.description || "";
  card.dataset.categories = JSON.stringify(state.categories || []);
  card.dataset.image = state.image || "";
  card.dataset.imageDark = state.imageDark || "";

  const showImage =
    brand === "rivian" ? isUsefulFeatureImage(state.image) : Boolean(state.image);
  const collapsed = card.querySelector(".card-media-collapsed");
  const expanded = card.querySelector(".card-media-expanded");
  if (collapsed) {
    collapsed.outerHTML = showImage
      ? renderMedia(state.image, state.title, "card-media-collapsed")
      : brand === "rivian"
        ? `<div class="card-media card-media-collapsed" hidden></div>`
        : renderMedia(state.image, state.title, "card-media-collapsed");
  }
  if (expanded) {
    expanded.outerHTML = showImage
      ? renderMedia(state.image, state.title, "card-media-expanded has-image")
      : `<div class="card-media card-media-expanded"></div>`;
  }
}

function canonicalCategories() {
  return data?.categories || [];
}

function renderTagChipHtml(category, index) {
  const isPrimary = index === 0;
  return `
    <div
      class="tag-chip is-selected${isPrimary ? " is-primary" : ""}"
      role="listitem"
      data-cat="${escapeHtml(category)}"
      data-index="${index}"
      aria-grabbed="false"
      title="${isPrimary ? "Primary category — drag to reorder" : "Drag to reorder"}"
    >
      <span class="tag-chip-grip" aria-hidden="true">⋮⋮</span>
      <span class="tag-chip-label">${escapeHtml(category)}</span>
      ${isPrimary ? `<span class="tag-chip-primary-label">Primary</span>` : ""}
      <span class="tag-chip-remove" role="button" tabindex="0" aria-label="Remove ${escapeHtml(category)}">×</span>
    </div>`;
}

function buildEditCategoryChips(selected) {
  const selectedSet = new Set(selected);
  const selectedHtml = selected.map((c, i) => renderTagChipHtml(c, i)).join("");
  const options = canonicalCategories()
    .filter((c) => !selectedSet.has(c))
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("");
  return `
    <div class="edit-tags" data-selected='${escapeHtml(JSON.stringify(selected))}'>
      <div class="edit-tags-selected" role="list" aria-label="Selected category tags. Drag to reorder; first tag is primary.">${
        selectedHtml || `<span class="edit-tags-empty">No tags selected</span>`
      }</div>
      <label class="edit-tag-add">
        <span class="sr-only">Add category tag</span>
        <select class="edit-tag-select" aria-label="Add category tag">
          <option value="">Add category…</option>
          ${options}
        </select>
      </label>
      <p class="edit-hint">Drag tags to reorder. Primary category is the first tag. Use only existing categories.</p>
    </div>`;
}

function readEditState(card) {
  const title = card.querySelector(".edit-title")?.value ?? "";
  const description = card.querySelector(".edit-description")?.value ?? "";
  const image = card.querySelector(".edit-image-url")?.value ?? "";
  const imageDark = card.querySelector(".edit-image-dark-url")?.value ?? "";
  let categories = [];
  try {
    categories = JSON.parse(
      card.querySelector(".edit-tags")?.dataset.selected || "[]"
    );
  } catch {
    categories = [];
  }
  return {
    title,
    description,
    image,
    imageDark,
    categories,
    featureIds: JSON.parse(card.dataset.featureIds || "[]"),
  };
}

function validateEditState(state) {
  const errors = [];
  if (!String(state.title || "").trim()) {
    errors.push("Feature name cannot be empty.");
  }
  if (!Array.isArray(state.categories) || !state.categories.length) {
    errors.push("Select at least one category tag.");
  } else {
    const canonical = new Set(canonicalCategories());
    for (const c of state.categories) {
      if (!canonical.has(c)) errors.push(`Invalid category: ${c}`);
    }
  }
  return errors;
}

function showEditErrors(card, errors) {
  const el = card.querySelector(".edit-errors");
  if (!el) return;
  if (!errors.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = `<ul>${errors
    .map((e) => `<li>${escapeHtml(e)}</li>`)
    .join("")}</ul>`;
}

function showEditStatus(card, message, kind = "info") {
  const el = card.querySelector(".edit-status");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    el.dataset.kind = "";
    return;
  }
  el.hidden = false;
  el.dataset.kind = kind;
  el.textContent = message;
}

function enterCardEditMode(card) {
  if (card.classList.contains("is-editing")) return;
  const snap = getCardSnapshot(card);
  card.dataset.editSnapshot = JSON.stringify(snap);
  setCardDirty(card, false);
  card.classList.add("is-editing");
  card.setAttribute("aria-label", "Edit feature details");

  const body = card.querySelector(".card-body");
  if (!body) return;

  const viewTop = body.querySelector(".card-top");
  const viewTitle = body.querySelector(".card-title-view");
  const viewDesc = body.querySelector(".card-desc");
  const links = body.querySelector(".feature-links");
  const meta = body.querySelector(".card-meta-row");
  const footer = body.querySelector(".card-footer, .card-footer-multi");
  const editBtn = card.querySelector(".card-edit-btn");

  [viewTop, viewTitle, viewDesc, links, meta, footer].forEach((el) => {
    if (el) el.hidden = true;
  });
  if (editBtn) editBtn.hidden = true;

  const form = document.createElement("form");
  form.className = "card-edit-form";
  form.noValidate = true;
  form.innerHTML = `
    <div class="edit-errors" hidden role="alert"></div>
    <label class="edit-field">
      <span>Feature name</span>
      <input type="text" class="edit-title" value="${escapeHtml(snap.title)}" aria-required="true" autocomplete="off" />
    </label>
    <label class="edit-field">
      <span>Description</span>
      <textarea class="edit-description" rows="8" aria-label="Feature description">${escapeHtml(snap.description)}</textarea>
    </label>
    <fieldset class="edit-fieldset">
      <legend>Category tags</legend>
      ${buildEditCategoryChips(snap.categories)}
    </fieldset>
    <fieldset class="edit-fieldset">
      <legend>Images</legend>
      <div class="edit-image-grid">
        <div class="edit-image-block">
          <span class="edit-label">Primary image</span>
          <div class="edit-image-preview">${
            snap.image
              ? `<img src="${escapeHtml(publicImageSrc(snap.image))}" alt="Primary image preview" />`
              : `<div class="edit-image-empty">No image</div>`
          }</div>
          <label class="edit-field">
            <span>Image URL</span>
            <input type="text" class="edit-image-url" spellcheck="false" autocomplete="off" value="${escapeHtml(snap.image)}" placeholder="https://… or /data/uploads/…" />
          </label>
          <label class="edit-file">
            <span>Upload replacement</span>
            <input type="file" class="edit-image-file" accept="image/*" />
          </label>
          <button type="button" class="btn-text edit-image-clear" data-target="image">Remove primary image</button>
        </div>
        <div class="edit-image-block">
          <span class="edit-label">Dark / secondary image</span>
          <div class="edit-image-preview is-dark">${
            snap.imageDark
              ? `<img src="${escapeHtml(publicImageSrc(snap.imageDark))}" alt="Secondary image preview" />`
              : `<div class="edit-image-empty">No secondary image</div>`
          }</div>
          <label class="edit-field">
            <span>Secondary image URL</span>
            <input type="text" class="edit-image-dark-url" spellcheck="false" autocomplete="off" value="${escapeHtml(snap.imageDark)}" placeholder="Optional" />
          </label>
          <label class="edit-file">
            <span>Upload secondary</span>
            <input type="file" class="edit-image-dark-file" accept="image/*" />
          </label>
          <button type="button" class="btn-text edit-image-clear" data-target="imageDark">Remove secondary image</button>
        </div>
      </div>
      <p class="edit-hint">Supported: PNG, JPEG, WebP, GIF · max 5MB · max 6000px</p>
    </fieldset>
    <div class="edit-status" hidden role="status"></div>
    <div class="edit-form-actions">
      <button type="button" class="btn-secondary edit-cancel">Cancel</button>
      <button type="submit" class="btn-primary edit-save">Save</button>
    </div>
  `;
  body.appendChild(form);
  bindEditForm(card, form);
  form.querySelector(".edit-title")?.focus();
}

function exitCardEditMode(card, { restore = false, skipConfirm = false } = {}) {
  if (!card.classList.contains("is-editing")) return true;
  if (!skipConfirm && cardHasUnsavedEdits(card)) {
    if (!confirmDiscardEdits()) return false;
  }
  if (restore) {
    try {
      const snap = JSON.parse(card.dataset.editSnapshot || "{}");
      updateCardViewFromState(card, {
        title: snap.title || "",
        description: snap.description || "",
        categories: snap.categories || [],
        image: snap.image || "",
        imageDark: snap.imageDark || "",
      });
    } catch {
      /* keep current */
    }
  }
  card.querySelector(".card-edit-form")?.remove();
  card.classList.remove("is-editing");
  setCardDirty(card, false);
  delete card.dataset.editSnapshot;
  card.setAttribute("aria-label", "Open full feature details");
  card.querySelectorAll(".card-body > *").forEach((el) => {
    el.hidden = false;
  });
  const editBtn = card.querySelector(".card-edit-btn");
  if (editBtn) editBtn.hidden = false;
  return true;
}

function refreshTagAddOptions(form) {
  const wrap = form.querySelector(".edit-tags");
  if (!wrap) return;
  let selected = [];
  try {
    selected = JSON.parse(wrap.dataset.selected || "[]");
  } catch {
    selected = [];
  }
  const selectedSet = new Set(selected);
  const select = form.querySelector(".edit-tag-select");
  if (!select) return;
  select.innerHTML =
    `<option value="">Add category…</option>` +
    canonicalCategories()
      .filter((c) => !selectedSet.has(c))
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join("");
}

function setSelectedTags(form, categories) {
  const unique = [];
  for (const c of categories) {
    if (!unique.includes(c)) unique.push(c);
  }
  const wrap = form.querySelector(".edit-tags");
  if (!wrap) return;
  wrap.dataset.selected = JSON.stringify(unique);
  const selectedHtml = unique.map((c, i) => renderTagChipHtml(c, i)).join("");
  const box = wrap.querySelector(".edit-tags-selected");
  if (box) {
    box.innerHTML =
      selectedHtml || `<span class="edit-tags-empty">No tags selected</span>`;
  }
  refreshTagAddOptions(form);
  bindTagDragReorder(form);
}

function bindTagDragReorder(form) {
  const box = form.querySelector(".edit-tags-selected");
  if (!box || box.dataset.dragBound === "1") return;
  box.dataset.dragBound = "1";

  const drag = {
    active: false,
    moved: false,
    pointerId: null,
    cat: null,
    chip: null,
    startX: 0,
    startY: 0,
  };

  function readSelected() {
    try {
      return JSON.parse(form.querySelector(".edit-tags").dataset.selected || "[]");
    } catch {
      return [];
    }
  }

  function clearDropMarks() {
    box.querySelectorAll(".tag-chip.is-drop-target").forEach((el) => {
      el.classList.remove("is-drop-target", "is-drop-before", "is-drop-after");
    });
  }

  function dropTargetAt(clientX, clientY, movingCat) {
    const chips = [...box.querySelectorAll(".tag-chip")].map(chipMetrics);
    const nearest = nearestChipFromPoint(chips, clientX, clientY, movingCat);
    if (!nearest) return null;
    const el = [...box.querySelectorAll(".tag-chip")].find(
      (c) => c.dataset.cat === nearest.cat
    );
    if (!el) return null;
    const before = dropBeforeFromPoint(el.getBoundingClientRect(), clientX);
    return { cat: nearest.cat, el, before };
  }

  function paintDropTarget(clientX, clientY, movingCat) {
    clearDropMarks();
    const target = dropTargetAt(clientX, clientY, movingCat);
    if (!target) return null;
    target.el.classList.add(
      "is-drop-target",
      target.before ? "is-drop-before" : "is-drop-after"
    );
    return target;
  }

  function onPointerMove(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && dx * dx + dy * dy < 16) return;
    drag.moved = true;
    e.preventDefault();
    drag.chip?.classList.add("is-dragging");
    drag.chip?.setAttribute("aria-grabbed", "true");
    paintDropTarget(e.clientX, e.clientY, drag.cat);
  }

  function endDrag(e) {
    if (!drag.active) return;
    if (e && drag.pointerId != null && e.pointerId !== drag.pointerId) return;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    const moving = drag.cat;
    const moved = drag.moved;
    const x = e?.clientX;
    const y = e?.clientY;
    try {
      drag.chip?.releasePointerCapture?.(drag.pointerId);
    } catch {
      /* already released */
    }
    drag.chip?.classList.remove("is-dragging");
    drag.chip?.setAttribute("aria-grabbed", "false");
    const target =
      moved && x != null ? paintDropTarget(x, y, moving) : null;
    clearDropMarks();
    drag.active = false;
    drag.moved = false;
    drag.pointerId = null;
    drag.cat = null;
    drag.chip = null;
    if (!moved || !moving || !target) return;
    const selected = readSelected();
    const next = moveTagRelative(selected, moving, target.cat, target.before);
    if (next.join("\u0000") === selected.join("\u0000")) return;
    box.dataset.suppressClick = "1";
    setSelectedTags(form, next);
    setCardDirty(form.closest(".card"), true);
  }

  box.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest(".tag-chip-remove")) return;
    const chip = e.target.closest(".tag-chip");
    if (!chip || !box.contains(chip)) return;
    drag.active = true;
    drag.moved = false;
    drag.pointerId = e.pointerId;
    drag.cat = chip.dataset.cat;
    drag.chip = chip;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    chip.setPointerCapture?.(e.pointerId);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  });
  box.addEventListener(
    "click",
    (e) => {
      if (box.dataset.suppressClick !== "1") return;
      delete box.dataset.suppressClick;
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );
}

function bindEditForm(card, form) {
  const markDirty = () => setCardDirty(card, true);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    e.stopPropagation();
    saveCardEdits(card);
  });
  form.addEventListener(
    "invalid",
    (e) => {
      e.preventDefault();
      showEditErrors(card, [
        explainEditFailure(e.target?.validationMessage || e.message),
      ]);
    },
    true
  );

  form.querySelector(".edit-title")?.addEventListener("input", markDirty);
  form.querySelector(".edit-description")?.addEventListener("input", markDirty);
  form.querySelector(".edit-image-url")?.addEventListener("input", (e) => {
    markDirty();
    const preview = form.querySelectorAll(".edit-image-preview")[0];
    const val = e.target.value.trim();
    if (preview) {
      preview.innerHTML = val
        ? `<img src="${escapeHtml(publicImageSrc(val))}" alt="Primary image preview" />`
        : `<div class="edit-image-empty">No image</div>`;
    }
  });
  form.querySelector(".edit-image-dark-url")?.addEventListener("input", (e) => {
    markDirty();
    const preview = form.querySelectorAll(".edit-image-preview")[1];
    const val = e.target.value.trim();
    if (preview) {
      preview.innerHTML = val
        ? `<img src="${escapeHtml(publicImageSrc(val))}" alt="Secondary image preview" />`
        : `<div class="edit-image-empty">No secondary image</div>`;
    }
  });

  form.querySelector(".edit-tags-selected")?.addEventListener("click", (e) => {
    const remove = e.target.closest(".tag-chip-remove");
    const chip = e.target.closest(".tag-chip");
    if (!chip) return;
    // Only remove when clicking the ×; drag handle / body are for reorder
    if (!remove) return;
    e.preventDefault();
    e.stopPropagation();
    const cat = chip.dataset.cat;
    let selected = [];
    try {
      selected = JSON.parse(form.querySelector(".edit-tags").dataset.selected || "[]");
    } catch {
      selected = [];
    }
    setSelectedTags(
      form,
      selected.filter((c) => c !== cat)
    );
    markDirty();
  });

  form.querySelector(".edit-tag-select")?.addEventListener("change", (e) => {
    const value = e.target.value;
    if (!value) return;
    let selected = [];
    try {
      selected = JSON.parse(form.querySelector(".edit-tags").dataset.selected || "[]");
    } catch {
      selected = [];
    }
    if (!selected.includes(value)) selected.push(value);
    setSelectedTags(form, selected);
    e.target.value = "";
    markDirty();
  });

  bindTagDragReorder(form);

  form.querySelectorAll(".edit-image-clear").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      if (target === "image") {
        setInputValue(form.querySelector(".edit-image-url"), "");
        form.querySelectorAll(".edit-image-preview")[0].innerHTML =
          `<div class="edit-image-empty">No image</div>`;
      } else {
        setInputValue(form.querySelector(".edit-image-dark-url"), "");
        form.querySelectorAll(".edit-image-preview")[1].innerHTML =
          `<div class="edit-image-empty">No secondary image</div>`;
      }
      markDirty();
    });
  });

  const bindUpload = (inputSelector, urlSelector, previewIndex) => {
    form.querySelector(inputSelector)?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      showEditStatus(card, "Uploading image…", "info");
      showEditErrors(card, []);
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const res = await fetch("/api/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            mime: file.type,
            data: dataUrl,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error((json.errors || ["Upload failed"]).join(" "));
        }
        setInputValue(form.querySelector(urlSelector), json.url);
        const preview = form.querySelectorAll(".edit-image-preview")[previewIndex];
        if (preview) {
          preview.innerHTML = `<img src="${escapeHtml(publicImageSrc(json.url))}" alt="Image preview" />`;
        }
        markDirty();
        showEditStatus(card, "Image uploaded.", "success");
      } catch (err) {
        showEditStatus(card, "", "info");
        showEditErrors(card, [
          explainEditFailure(err.message || "Image upload failed"),
        ]);
      } finally {
        setInputValue(e.target, "");
      }
    });
  };
  bindUpload(".edit-image-file", ".edit-image-url", 0);
  bindUpload(".edit-image-dark-file", ".edit-image-dark-url", 1);

  form.querySelector(".edit-cancel")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    exitCardEditMode(card, { restore: true });
  });

}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

async function saveCardEdits(card) {
  const state = readEditState(card);
  const errors = validateEditState(state);
  showEditErrors(card, errors);
  if (errors.length) return;

  const saveBtn = card.querySelector(".edit-save");
  const cancelBtn = card.querySelector(".edit-cancel");
  if (saveBtn?.dataset.saving === "1") return;
  if (saveBtn) {
    saveBtn.dataset.saving = "1";
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
  }
  if (cancelBtn) cancelBtn.disabled = true;
  showEditStatus(card, "Saving changes…", "info");

  try {
    const res = await fetch("/api/feature-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand,
        ids: state.featureIds,
        title: state.title.trim(),
        description: state.description,
        categories: state.categories,
        image: state.image.trim(),
        imageDark: state.imageDark.trim(),
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error((json.errors || ["Save failed"]).join(" "));
    }

    updateCardViewFromState(card, {
      title: state.title.trim(),
      description: state.description,
      categories: state.categories,
      image: state.image.trim(),
      imageDark: state.imageDark.trim(),
    });
    setCardDirty(card, false);
    card.querySelector(".card-edit-form")?.remove();
    card.classList.remove("is-editing");
    delete card.dataset.editSnapshot;
    card.querySelectorAll(".card-body > *").forEach((el) => {
      el.hidden = false;
    });
    const editBtn = card.querySelector(".card-edit-btn");
    if (editBtn) editBtn.hidden = false;
    card.setAttribute("aria-label", "Open full feature details");

    // Refresh in-memory data so filters/groups stay consistent after reopen
    await ensureBrandLoaded(brand, { bustCache: true });
    data = brandCache[brand].data;
    groups = brandCache[brand].groups;
    fillCategoryOptions();
    fillYearOptions();
    fillVersionOptions();
    render();

    // Re-expand the edited card in the overlay (keeps the grid stable)
    const group = findFeatureGroup(state.featureIds, state.title);
    if (group) {
      mountAndExpandFeatureCard(group);
      showToast("Feature updated.");
    }
  } catch (err) {
    showEditStatus(card, "", "info");
    showEditErrors(card, [
      explainEditFailure(err.message || "Save failed. Your edits are still here."),
    ]);
    if (saveBtn) {
      saveBtn.dataset.saving = "0";
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
    if (cancelBtn) cancelBtn.disabled = false;
  }
}

function showToast(message) {
  let toast = document.getElementById("appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "app-toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function bindCardExpand(root) {
  root.querySelectorAll(".card").forEach((card) => {
    const closeBtn = card.querySelector(".card-close");
    const editBtn = card.querySelector(".card-edit-btn");
    if (!closeBtn) return;

    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "Open full feature details");

    const open = () => {
      if (card.classList.contains("is-expanded")) return;
      expandCardFromGridCard(card);
    };

    card.addEventListener("click", (e) => {
      if (card.classList.contains("is-expanded")) return;
      if (e.target.closest("a, button, select, label, input, textarea")) return;
      open();
    });

    card.addEventListener("keydown", (e) => {
      if (card.classList.contains("is-expanded")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      collapseExpandedCard();
    });

    editBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!card.classList.contains("is-expanded")) expandCardFromGridCard(card);
      // Edit mode applies to the expanded overlay card once mounted.
      const expanded =
        document.querySelector("#featureDetailHost .card.is-expanded") ||
        document.querySelector(".card.is-expanded");
      if (expanded) enterCardEditMode(expanded);
    });
  });
}

function render() {
  if (!data) return;
  collapseExpandedCard({ force: true });
  clearFeatureDetailHost();
  renderCharts();

  const cat = categorySelect.value;
  const year = yearSelect.value;
  const model = selectedVehicleModel();
  const q = searchInput.value.trim();
  const searching = Boolean(q);
  const baseItems = filteredGroups();
  const scoped = scopedGroups();
  const scope = searching
    ? scoped.length
    : scoped.filter((g) => {
        if (cat !== "all" && !g.categories.includes(cat)) return false;
        return groupMatchesYear(g, year);
      }).length;

  const parts = [];
  if (q) {
    parts.push(`Search “${q}”`);
    if (model !== "all") parts.push(vehicleModelLabel(brand, model));
    parts.push("all categories");
    parts.push("all years");
  } else {
    if (model !== "all") parts.push(vehicleModelLabel(brand, model));
    if (year !== "all") parts.push(year);
    if (cat !== "all") parts.push(cat);
  }

  resultMeta.classList.remove("result-meta-with-toggle");

  // List/Cards toggle in the gutter between chart/filters and results.
  let items = baseItems;
  let detailVm = null;
  const showLayoutSwitch = layoutSwitchAvailable() && !searching;
  const drillForView = effectiveDetailDrill();

  if (showLayoutSwitch && drillForView) {
    detailVm = buildDetailViewModel(scoped, drillForView, currentFilterState());
    // When a category (or bar drill) scopes the view, cards share the same feature IDs as List.
    if (drillForView.category || chartDrill) {
      items = filterGroupsByFeatureIds(baseItems, detailVm.featureIds);
    }

    resultMeta.classList.add("result-meta-with-toggle");
    resultMeta.innerHTML = layoutToggleHtml();
    bindLayoutToggle(resultMeta);

    if (detailLayout === "list") {
      try {
        const listFeatures =
          detailVm.features ||
          collapseDetailRowsToFeatures(detailVm.rows || []);
        if (!listFeatures.length) {
          resultsEl.classList.add("is-detail-list");
          resultsEl.innerHTML = `<div class="empty">No OTA entries match the active filters.</div>`;
          return;
        }
        resultsEl.classList.add("is-detail-list");
        resultsEl.innerHTML = renderGroupedDetailHtml(
          detailVm.featureGrouped || {
            mode: "year",
            year: detailVm.scope?.year,
            months: [],
            years: [],
          }
        );
        bindChartDetailChrome();
      } catch (err) {
        console.error(err);
        resultsEl.classList.add("is-detail-list");
        resultsEl.innerHTML = renderChartDetailShell({
          status: "error",
          message: "Could not build the OTA detail list. Your filters were left unchanged.",
        });
        bindChartDetailChrome();
      }
      return;
    }

    resultsEl.classList.remove("is-detail-list");
  } else {
    if (!searching) detailLayout = "cards";
    const metaLabel = parts.length
      ? `${parts.join(" · ")}: ${items.length} ${BRAND_META[brand].label} features`
      : `Showing ${items.length} of ${scope} unique ${BRAND_META[brand].label} features`;
    resultMeta.textContent = metaLabel;
    resultsEl.classList.remove("is-detail-list");
  }

  if (items.length === 0) {
    resultsEl.innerHTML = searching
      ? `<div class="empty">No features match this search.</div>`
      : `<div class="empty">No release notes match these filters.</div>`;
    return;
  }

  resultsEl.innerHTML = items.map((f, i) => renderFeatureCardHtml(f, i)).join("");

  bindFooterSelects(resultsEl);
  bindCardExpand(resultsEl);
}

async function fetchBrandData(brandKey, { bustCache = false } = {}) {
  const url = bustCache
    ? `${BRAND_META[brandKey].dataUrl}?t=${Date.now()}`
    : BRAND_META[brandKey].dataUrl;
  const res = await fetch(url, { cache: bustCache ? "no-store" : "default" });
  if (!res.ok) return null;
  return res.json();
}

async function fetchCategoryOverrides(brandKey, { bustCache = false } = {}) {
  const overridesUrl = BRAND_META[brandKey].overridesUrl;
  if (!overridesUrl) return { version: 1, overrides: [] };
  const url = bustCache ? `${overridesUrl}?t=${Date.now()}` : overridesUrl;
  try {
    const res = await fetch(url, { cache: bustCache ? "no-store" : "default" });
    if (!res.ok) return { version: 1, overrides: [] };
    return res.json();
  } catch {
    return { version: 1, overrides: [] };
  }
}

async function fetchFeatureEdits(brandKey, { bustCache = false } = {}) {
  // Prefer API so edits are always fresh; fall back to static file.
  const tryUrls = ["/api/feature-edits", BRAND_META[brandKey].editsUrl].filter(
    Boolean
  );
  for (const base of tryUrls) {
    const url = bustCache ? `${base}?t=${Date.now()}` : base;
    try {
      const res = await fetch(url, { cache: bustCache ? "no-store" : "default" });
      if (res.ok) return res.json();
    } catch {
      /* try next */
    }
  }
  return { version: 1, edits: [] };
}

function applyFeatureEdits(features, editsDoc) {
  const map = new Map();
  for (const e of editsDoc?.edits || []) {
    if (e?.id) map.set(e.id, e);
  }
  return (features || []).map((f) => {
    const e = map.get(f.id);
    if (!e) return f;
    const hasManualCategories =
      Array.isArray(e.categories) && e.categories.length > 0;
    const categories = hasManualCategories ? e.categories : f.categories;
    return {
      ...f,
      title: e.title !== undefined ? e.title : f.title,
      description: e.description !== undefined ? e.description : f.description,
      image: e.image !== undefined ? e.image : f.image,
      imageDark: e.imageDark !== undefined ? e.imageDark : f.imageDark,
      categories: [...(categories || [])],
      primaryCategory: (categories && categories[0]) || f.primaryCategory,
      featureEdited: true,
      ...(hasManualCategories
        ? {
            categorySource: e.categorySource || "manual_override",
            categoriesAuto: f.categoriesAuto || [...(f.categories || [])],
          }
        : {}),
    };
  });
}

async function ensureBrandLoaded(brandKey, { bustCache = false } = {}) {
  if (brandCache[brandKey] && !bustCache) return true;
  const json = await fetchBrandData(brandKey, { bustCache });
  if (!json) return false;
  const overrideDoc = await fetchCategoryOverrides(brandKey, { bustCache });
  const editsDoc = await fetchFeatureEdits(brandKey, { bustCache });
  let features = json.features || [];
  if (brandKey === "tesla") {
    features = features.map(normalizeTeslaFeatureTags);
  }
  features = applyCategoryOverrides(
    features,
    overrideDoc,
    json.categories || []
  );
  features = applyFeatureEdits(features, editsDoc);
  features = inheritManualCategoriesByFeatureKey(features);
  features = inheritEditedImagesByFeatureKey(features);
  if (brandKey === "tesla") {
    features = features.map(normalizeTeslaFeatureTags);
  }
  brandCache[brandKey] = {
    data: { ...json, features },
    groups: buildGroups(features),
    overrides: overrideDoc,
    edits: editsDoc,
  };
  return true;
}

async function loadBrand(nextBrand, { quiet = false, bustCache = false } = {}) {
  const switching = nextBrand !== brand;
  brand = nextBrand;
  document.body.dataset.brand = brand;
  updateHeroPhoto(brand);

  brandButtons.forEach((btn) => {
    const active = btn.dataset.brand === brand;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });

  if (!quiet) {
    resultsEl.innerHTML = `<div class="empty">Loading ${BRAND_META[brand].label} release notes…</div>`;
    chartPanel.hidden = true;
  }

  if (switching) {
    chartDrill = null;
    chartDetailStatus = "idle";
    chartDetailError = null;
    if (nextBrand !== "tesla") chartView = "frequency";
    clearFeatureDetailHost();
    chartPanel.classList.remove(
      "is-detail",
      "is-cards-layout",
      "is-list-layout",
      "is-milestone",
      "is-revenue-simulator"
    );
    if (chartHeaderActions) chartHeaderActions.innerHTML = "";
    applyDetailLayoutVisibility();
  }

  const ok = await ensureBrandLoaded(brand, { bustCache });
  if (!ok) {
    if (!quiet) {
      resultsEl.innerHTML = `<div class="empty">${BRAND_META[brand].label} data not ready yet. Run <code>node scripts/monitor.mjs</code> first.</div>`;
    }
    data = null;
    groups = [];
    renderLastUpdated(null);
    return;
  }

  const savedModel = quiet && !switching ? selectedVehicleModel() : "all";
  const savedCategory = quiet && !switching ? categorySelect.value : "all";
  const savedYear = quiet && !switching ? yearSelect.value : "all";
  const savedVersion = quiet && !switching ? versionSelect.value : "all";
  const savedSearch = quiet && !switching ? searchInput.value : "";

  data = brandCache[brand].data;
  groups = brandCache[brand].groups;
  renderLastUpdated(data?.scrapedAt);
  if (brand === "tesla") ensureTeslaMilestones();

  if (!quiet || switching) searchInput.value = "";
  else searchInput.value = savedSearch;

  fillControls();

  if (quiet && !switching) {
    fillModelOptions(true);
    if (modelSelect) {
      modelSelect.value = isValidVehicleModel(brand, savedModel)
        ? savedModel
        : "all";
    }
    if ([...categorySelect.options].some((o) => o.value === savedCategory)) {
      categorySelect.value = savedCategory;
    }
    fillYearOptions(true);
    if ([...yearSelect.options].some((o) => o.value === savedYear)) {
      yearSelect.value = savedYear;
    } else {
      yearSelect.value = "all";
    }
    fillCategoryOptions(true);
    fillVersionOptions(true);
    if ([...versionSelect.options].some((o) => o.value === savedVersion)) {
      versionSelect.value = savedVersion;
    } else {
      versionSelect.value = "all";
    }
    searchInput.value = savedSearch;
    updateStats();
  }

  render();
}

async function pollForDataUpdates() {
  try {
    let anyChanged = false;
    for (const key of Object.keys(BRAND_META)) {
      const json = await fetchBrandData(key, { bustCache: true });
      if (!json) continue;
      const prev = brandCache[key]?.data;
      const changed =
        !prev ||
        prev.scrapedAt !== json.scrapedAt ||
        prev.releaseCount !== json.releaseCount ||
        prev.featureCount !== json.featureCount;
      if (!changed) continue;

      anyChanged = true;
      await ensureBrandLoaded(key, { bustCache: true });
      console.info(
        `[live] ${BRAND_META[key].label} data updated (${json.releaseCount} OTAs)`
      );
    }

    if (!anyChanged) return;
    await loadBrand(brand, { quiet: true, bustCache: false });
  } catch (err) {
    console.warn("[live] poll failed", err);
  }
}

let lastMonitorSnapshot = "";
let monitorWasRunning = false;

function formatLastUpdated(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const formatted = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `Last updated: ${formatted}`;
}

function renderLastUpdated(iso) {
  if (!lastUpdatedEl) return;
  const label = formatLastUpdated(iso);
  lastUpdatedEl.textContent = label;
  lastUpdatedEl.hidden = !label;
}

function formatAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return "";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}

function renderSourceSync(status) {
  if (!sourceSyncEl) return;
  if (!status || status.disabled) {
    sourceSyncEl.textContent = "";
    return;
  }
  const added = (status.summary || []).reduce((n, s) => n + (s.added || 0), 0);
  const ago = formatAgo(status.checkedAt || status.lastFinishedAt);
  if (status.running) {
    sourceSyncEl.textContent =
      "Checking Tesla and Rivian sources for new OTA notes…";
    return;
  }
  if (status.lastError) {
    sourceSyncEl.textContent =
      "Could not reach OTA sources — will retry automatically.";
    return;
  }
  if (added > 0) {
    sourceSyncEl.textContent = ago
      ? `Feature cards updated from new OTA notes · last check ${ago}`
      : "Feature cards updated from new OTA notes.";
    return;
  }
  sourceSyncEl.textContent = ago
    ? `Watching Tesla and Rivian OTA sources · last check ${ago}`
    : "Watching Tesla and Rivian OTA sources.";
}

async function pollMonitorStatus() {
  try {
    let status = null;
    try {
      const res = await fetch(`/api/monitor-status?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) status = await res.json();
    } catch {
      // GitHub Pages has no admin/monitor API.
    }
    if (!status) {
      const res = await fetch(`./data/monitor-status.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      status = await res.json();
    }
    renderSourceSync(status);
    const snapshot = JSON.stringify({
      checkedAt: status.checkedAt,
      running: status.running,
      summary: status.summary,
    });
    const finishedRun = monitorWasRunning && !status.running;
    monitorWasRunning = !!status.running;
    if (snapshot === lastMonitorSnapshot && !finishedRun) return;
    lastMonitorSnapshot = snapshot;
    const scrapedNew = (status.summary || []).some(
      (s) => s.scraped && !s.contentUnchanged
    );
    if (finishedRun || scrapedNew) {
      await pollForDataUpdates();
    }
  } catch {
    // Source status is optional on the public dashboard.
  }
}

async function init() {
  brandButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.brand === brand) return;
      loadBrand(btn.dataset.brand);
    });
  });

  chartModeBar?.querySelectorAll("[data-chart-view]").forEach((btn) => {
    btn.addEventListener("click", () => setChartView(btn.dataset.chartView));
  });

  modelSelect?.addEventListener("change", () => {
    clearSearchQuery();
    fillYearOptions(true);
    fillCategoryOptions(true);
    fillVersionOptions(false);
    updateStats();
    render();
  });
  categorySelect.addEventListener("change", () => {
    clearSearchQuery();
    // Category filter becomes source of truth; keep drill for bar context only when filter is all
    if (chartDrill && categorySelect.value !== "all") {
      chartDrill = {
        ...chartDrill,
        category: categorySelect.value,
        barLabel: categorySelect.value,
      };
    }
    fillVersionOptions(false);
    render();
  });
  yearSelect.addEventListener("change", () => {
    clearSearchQuery();
    if (chartDrill) {
      // Year dropdown wins over bar-year scope so All years can expand the list
      const next = { ...chartDrill };
      delete next.year;
      delete next.month;
      chartDrill = next;
    }
    if (yearSelect.value !== "all" && categorySelect.value === "all") {
      pendingChartZoom = { ox: 50, oy: 42 };
    }
    fillCategoryOptions(true);
    fillVersionOptions(false);
    render();
  });
  versionSelect.addEventListener("change", render);
  searchInput.addEventListener("input", () => {
    if (isSearchActive()) resetScopeFiltersToAll();
    render();
  });

  cardBackdrop.addEventListener("click", () => {
    collapseExpandedCard();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (adminDialogHost && !adminDialogHost.hidden) {
        closeAdminDialog();
        return;
      }
      if (workspaceMode !== "chart") {
        setWorkspaceMode("chart");
        return;
      }
      collapseExpandedCard();
      return;
    }
    handleAdminImageKeys(e);
  });

  adminState = await fetchAdminSession();
  if (adminState.state === "authenticated") await loadAdminOverlays();
  renderAdminAuth();

  await loadBrand("tesla");
  await pollMonitorStatus();
  // Background monitor writes new scrape data; keep cards/list in sync
  setInterval(pollForDataUpdates, 60_000);
  setInterval(pollMonitorStatus, 15_000);
}

init();
