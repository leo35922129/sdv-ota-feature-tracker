#!/usr/bin/env node
/**
 * Tests for chart bar drill-down detail helpers + List/Cards shared view-model.
 * Run: node --test scripts/chart-detail.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveDetailScope,
  collectChartDetailRows,
  groupChartDetailRows,
  countDetailStats,
  uniqueOtaVersionsForCategoryYear,
  MONTH_LABELS,
  shortFeatureIntro,
  featureIdsFromDetailRows,
  filterGroupsByFeatureIds,
  buildDetailViewModel,
  flattenDetailMonths,
  categoriesSortedByOtaCount,
} from "./chart-detail.mjs";

const sampleGroups = [
  {
    title: "Bluetooth Menu",
    description: "Pair devices",
    categories: ["Connectivity", "Vehicle OS"],
    featureIds: ["bluetooth-menu-2026-14-detail"],
    releases: [
      {
        version: "2026.14",
        releaseDate: "2026-03-12",
        releaseUrl: "https://example.com/2026.14",
      },
      {
        version: "2026.20",
        releaseDate: "2026-05-01",
        releaseUrl: "https://example.com/2026.20",
      },
      {
        version: "2025.44",
        releaseDate: "2025-11-08",
        releaseUrl: "https://example.com/2025.44",
      },
    ],
  },
  {
    title: "Ambient Lighting",
    description: "Cabin lights",
    categories: ["Lighting"],
    featureIds: ["ambient-lighting-2026-14-detail"],
    releases: [
      {
        version: "2026.14",
        releaseDate: "2026-03-12",
        releaseUrl: "https://example.com/2026.14",
      },
    ],
  },
  {
    title: "Other Feature",
    description: "Unrelated",
    categories: ["Gaming"],
    featureIds: ["other-2026-14-detail"],
    releases: [
      {
        version: "2026.14",
        releaseDate: "2026-03-12",
        releaseUrl: "https://example.com/2026.14",
      },
    ],
  },
];

test("category lists sort most OTAs first and least last", () => {
  const tesla = categoriesSortedByOtaCount(
    [
      "Vehicle OS",
      "Autopilot / Full Self-Driving",
      "Mobile App",
      "Profile",
      "Interior Cabin",
    ],
    {
      "Vehicle OS": 122,
      "Autopilot / Full Self-Driving": 277,
      "Mobile App": 105,
      Profile: 15,
      "Interior Cabin": 1,
    }
  );
  assert.deepEqual(tesla, [
    "Autopilot / Full Self-Driving",
    "Vehicle OS",
    "Mobile App",
    "Profile",
    "Interior Cabin",
  ]);

  const rivian = categoriesSortedByOtaCount(
    ["Audio", "Drive Assist & Autonomy", "Connectivity"],
    { Audio: 4, "Drive Assist & Autonomy": 40, Connectivity: 12 }
  );
  assert.deepEqual(rivian, [
    "Drive Assist & Autonomy",
    "Connectivity",
    "Audio",
  ]);
});

test("selected-year filtering returns only that year and groups by month", () => {
  const scope = resolveDetailScope(
    { category: "Connectivity" },
    { category: "all", year: "2026", version: "all", search: "" }
  );
  assert.equal(scope.year, "2026");
  assert.equal(scope.category, "Connectivity");

  const rows = collectChartDetailRows(sampleGroups, scope);
  assert.ok(rows.every((r) => r.year === 2026));
  assert.ok(rows.every((r) => r.title === "Bluetooth Menu"));

  const grouped = groupChartDetailRows(rows, { year: "2026" });
  assert.equal(grouped.mode, "year");
  assert.equal(grouped.months.length, 2);
  assert.equal(grouped.months[0].monthLabel, "May");
  assert.equal(grouped.months[1].monthLabel, "Mar");
  assert.equal(grouped.months[0].otas[0].features[0].title, "Bluetooth Menu");
});

test("all-years filtering groups by year then month", () => {
  const scope = resolveDetailScope(
    { category: "Connectivity" },
    { category: "all", year: "all", version: "all", search: "" }
  );
  assert.equal(scope.year, "all");

  const rows = collectChartDetailRows(sampleGroups, scope);
  assert.equal(new Set(rows.map((r) => r.year)).size, 2);

  const grouped = groupChartDetailRows(rows, { year: "all" });
  assert.equal(grouped.mode, "all-years");
  assert.equal(grouped.years.length, 2);
  assert.equal(grouped.years[0].year, 2026);
  assert.equal(grouped.years[0].months[0].monthLabel, "May");
  assert.equal(grouped.years[1].year, 2025);
});

test("month grouping uses project month labels; newest months first", () => {
  assert.deepEqual(MONTH_LABELS.slice(0, 3), ["Jan", "Feb", "Mar"]);
  const scope = resolveDetailScope(
    { category: "Connectivity", month: 2 },
    { year: "2026", category: "all", version: "all", search: "" }
  );
  assert.equal(scope.month, 2);
  const rows = collectChartDetailRows(sampleGroups, scope);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].version, "2026.14");
});

test("version and search filters narrow detail results", () => {
  const byVersion = collectChartDetailRows(
    sampleGroups,
    resolveDetailScope(
      { category: "Connectivity" },
      { year: "2026", version: "2026.20", search: "" }
    )
  );
  assert.equal(byVersion.length, 1);
  assert.equal(byVersion[0].version, "2026.20");

  const bySearch = collectChartDetailRows(
    sampleGroups,
    resolveDetailScope(
      { category: "Connectivity" },
      { year: "all", version: "all", search: "pair" }
    )
  );
  assert.ok(bySearch.length >= 1);
  assert.ok(bySearch.every((r) => /pair/i.test(r.description)));

  const emptySearch = collectChartDetailRows(
    sampleGroups,
    resolveDetailScope(
      { category: "Connectivity" },
      { year: "all", version: "all", search: "zzzz-no-match" }
    )
  );
  assert.equal(emptySearch.length, 0);
});

test("feature-card titles are preserved exactly", () => {
  const rows = collectChartDetailRows(
    sampleGroups,
    resolveDetailScope(
      { category: "Lighting" },
      { year: "2026", version: "all", search: "" }
    )
  );
  assert.equal(rows[0].title, "Ambient Lighting");
});

test("chart OTA count matches unique versions in detail (no version/search)", () => {
  const chartSet = uniqueOtaVersionsForCategoryYear(
    sampleGroups,
    "Connectivity",
    "2026"
  );
  const rows = collectChartDetailRows(
    sampleGroups,
    resolveDetailScope(
      { category: "Connectivity" },
      { year: "2026", version: "all", search: "" }
    )
  );
  const detailSet = new Set(rows.map((r) => r.version));
  assert.deepEqual([...detailSet].sort(), [...chartSet].sort());
  assert.equal(countDetailStats(rows).otaCount, chartSet.size);
});

test("dedupes same feature within one OTA in grouped output", () => {
  const dupGroups = [
    {
      title: "Same Title",
      description: "a",
      categories: ["Lighting"],
      featureIds: ["a-1"],
      releases: [{ version: "2026.1", releaseDate: "2026-01-15" }],
    },
    {
      title: "Same Title",
      description: "b",
      categories: ["Lighting"],
      featureIds: ["a-1"],
      releases: [{ version: "2026.1", releaseDate: "2026-01-15" }],
    },
  ];
  const rows = collectChartDetailRows(
    dupGroups,
    resolveDetailScope(
      { category: "Lighting" },
      { year: "2026", version: "all", search: "" }
    )
  );
  const grouped = groupChartDetailRows(rows, { year: "2026" });
  const features = grouped.months[0].otas[0].features;
  assert.equal(features.length, 1);
});

test("empty results when category has no matching OTAs", () => {
  const rows = collectChartDetailRows(
    sampleGroups,
    resolveDetailScope(
      { category: "Trailering" },
      { year: "2026", version: "all", search: "" }
    )
  );
  assert.equal(rows.length, 0);
  assert.equal(countDetailStats(rows).otaCount, 0);
});

test("bar year scopes detail when year filter is all", () => {
  const scope = resolveDetailScope(
    { category: "Connectivity", year: 2025 },
    { category: "Connectivity", year: "all", version: "all", search: "" }
  );
  assert.equal(scope.year, "2025");
  const rows = collectChartDetailRows(sampleGroups, scope);
  assert.ok(rows.every((r) => r.year === 2025));
});

test("filter year overrides drill year when specific year selected", () => {
  const scope = resolveDetailScope(
    { category: "Connectivity", year: 2025 },
    { category: "all", year: "2026", version: "all", search: "" }
  );
  assert.equal(scope.year, "2026");
});

test("back navigation clears drill scope independently of filters", () => {
  const filters = {
    category: "all",
    year: "2026",
    version: "all",
    search: "",
  };
  const withDrill = resolveDetailScope({ category: "Lighting" }, filters);
  assert.equal(withDrill.category, "Lighting");
  const afterBack = resolveDetailScope(null, filters);
  assert.equal(afterBack.category, null);
  assert.equal(filters.year, "2026");
});

test("list layout styles and layout toggle are defined in stylesheet", () => {
  const css = readFileSync(
    new URL("../styles.css", import.meta.url),
    "utf8"
  );
  assert.match(css, /\.layout-toggle\s*\{/);
  assert.match(css, /\.layout-toggle-btn\.is-active\s*\{/);
  assert.match(css, /\.results\.is-detail-list\s*\{/);
  assert.match(css, /\.chart-detail-row\s*\{/);
  assert.match(css, /\.chart-detail-row-version\s*\{/);
  assert.match(css, /\.chart-detail-row-date\s*\{/);
  assert.match(css, /\.chart-detail-month-title\s*\{/);
  // Page scroll for long lists (results area); chart panel hidden in detail
  assert.match(css, /\.chart-panel\.is-detail\s*\{[^}]*display:\s*none/s);
});

test("app wires List/Cards toggle with accessible pressed state", () => {
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(app, /detailLayout\s*=\s*"cards"/);
  assert.match(app, /aria-label="Feature layout"/);
  assert.match(app, /aria-pressed=/);
  assert.match(app, /data-layout="list"/);
  assert.match(app, /data-layout="cards"/);
  assert.match(app, /buildDetailViewModel/);
  assert.match(app, /filterGroupsByFeatureIds/);
  assert.match(app, /layoutSwitchAvailable/);
  assert.match(app, /effectiveDetailDrill/);
  // Switching layout must not clear filter controls
  assert.match(
    app,
    /Layout only — filters, search, and drill scope stay untouched/
  );
});

test("error-style empty collection is safe for UI empty state", () => {
  const rows = collectChartDetailRows(null, {
    category: "Lighting",
    year: "2026",
    version: "all",
    search: "",
  });
  assert.deepEqual(rows, []);
  assert.equal(countDetailStats(rows).featureCount, 0);
});

test("shortFeatureIntro truncates feature-card description", () => {
  assert.equal(shortFeatureIntro(""), "");
  assert.equal(
    shortFeatureIntro("Customize your Self-Driving zoom preference. Select desired zoom."),
    "Customize your Self-Driving zoom preference."
  );
  const long = "A".repeat(200);
  assert.ok(shortFeatureIntro(long).endsWith("…"));
  assert.ok(shortFeatureIntro(long).length <= 161);
});

test("grouped features keep description for list intros", () => {
  const rows = collectChartDetailRows(
    sampleGroups,
    resolveDetailScope(
      { category: "Lighting" },
      { year: "2026", version: "all", search: "" }
    )
  );
  const grouped = groupChartDetailRows(rows, { year: "2026" });
  const feature = grouped.months[0].otas[0].features[0];
  assert.equal(feature.title, "Ambient Lighting");
  assert.equal(feature.description, "Cabin lights");
});

test("buildDetailViewModel shares one data pass for List and Cards", () => {
  const filters = {
    category: "Connectivity",
    year: "2026",
    version: "all",
    search: "",
  };
  const drill = { category: "Connectivity" };
  const vm = buildDetailViewModel(sampleGroups, drill, filters);

  assert.equal(vm.scope.category, "Connectivity");
  assert.equal(vm.scope.year, "2026");
  assert.ok(vm.rows.length >= 1);
  assert.ok(vm.featureIds.has("bluetooth-menu-2026-14-detail"));
  assert.equal(vm.grouped.mode, "year");

  // Cards use the same feature ID set; order preserved from caller groups
  const cardGroups = filterGroupsByFeatureIds(sampleGroups, vm.featureIds);
  assert.equal(cardGroups.length, 1);
  assert.equal(cardGroups[0].title, "Bluetooth Menu");
  assert.deepEqual(
    [...featureIdsFromDetailRows(vm.rows)].sort(),
    [...vm.featureIds].sort()
  );
});

test("List and Cards expose the same feature records under active filters", () => {
  const filters = {
    category: "all",
    year: "2026",
    version: "all",
    search: "",
  };
  const drill = { category: "Lighting", year: 2026 };
  const vm = buildDetailViewModel(sampleGroups, drill, filters);
  const listTitles = [...new Set(vm.rows.map((r) => r.title))].sort();
  const cardTitles = filterGroupsByFeatureIds(sampleGroups, vm.featureIds)
    .map((g) => g.title)
    .sort();
  assert.deepEqual(listTitles, cardTitles);
});

test("switching layout conceptually preserves filters (scope independent of layout)", () => {
  const filters = {
    category: "Connectivity",
    year: "2026",
    version: "2026.14",
    search: "pair",
  };
  const drill = { category: "Connectivity" };
  const listVm = buildDetailViewModel(sampleGroups, drill, filters);
  // Simulate layout switch: rebuild with identical filters/drill
  const cardsVm = buildDetailViewModel(sampleGroups, drill, filters);
  assert.deepEqual(listVm.scope, cardsVm.scope);
  assert.equal(listVm.rows.length, cardsVm.rows.length);
  assert.deepEqual([...listVm.featureIds].sort(), [...cardsVm.featureIds].sort());
  assert.equal(filters.version, "2026.14");
  assert.equal(filters.search, "pair");
});

test("list rows carry title, description, version, and release date", () => {
  const vm = buildDetailViewModel(
    sampleGroups,
    { category: "Connectivity" },
    { category: "all", year: "2026", version: "all", search: "" }
  );
  for (const row of vm.rows) {
    assert.ok(row.title);
    assert.equal(typeof row.description, "string");
    assert.ok(row.version);
    assert.ok(row.releaseDate);
  }
  const firstFeature = vm.grouped.months[0].otas[0].features[0];
  assert.equal(firstFeature.title, "Bluetooth Menu");
  assert.equal(firstFeature.description, "Pair devices");
});

test("list collapses same title+description into one feature with multi-release dropdown", () => {
  const vm = buildDetailViewModel(
    sampleGroups,
    { category: "Connectivity" },
    { category: "all", year: "2026", version: "all", search: "" }
  );
  // Two OTA rows for Bluetooth Menu in 2026 → one list feature with 2 releases
  assert.equal(vm.rows.length, 2);
  assert.equal(vm.features.length, 1);
  assert.equal(vm.stats.featureCount, 1);
  assert.equal(vm.features[0].title, "Bluetooth Menu");
  assert.equal(vm.features[0].releases.length, 2);
  assert.equal(vm.features[0].releases[0].version, "2026.20");

  const cards = filterGroupsByFeatureIds(sampleGroups, vm.featureIds);
  assert.equal(cards.length, vm.features.length);

  const flat = flattenDetailMonths(vm.featureGrouped);
  const listRows = flat.reduce((n, m) => n + (m.features || []).length, 0);
  assert.equal(listRows, cards.length);
  assert.equal(flat[0].headingLabel, "May 2026");
});

test("default layout preference in app is Cards (original presentation)", () => {
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(app, /let detailLayout = "cards"/);
});

test("list row opens detail overlay without leaving List layout", () => {
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(app, /featureDetailHost/);
  assert.match(app, /mountAndExpandFeatureCard/);
  assert.match(app, /Always open detail in the overlay host/);
  assert.match(app, /expandCardFromGridCard/);
  assert.doesNotMatch(app, /layoutBeforeFeatureDetail/);
  assert.match(app, /function openFeatureCardByIds/);
  assert.match(app, /function expandCard/);
  assert.match(app, /enterCardEditMode/);
});

test("responsive list row breakpoint collapses metadata columns", () => {
  const css = readFileSync(
    new URL("../styles.css", import.meta.url),
    "utf8"
  );
  assert.match(css, /@media \(max-width:\s*640px\)/);
  assert.match(css, /\.chart-detail-row\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test("loading empty and error detail shells are defined", () => {
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(app, /status === "loading"/);
  assert.match(app, /status === "error"/);
  assert.match(app, /status === "empty"/);
  assert.match(app, /No OTA entries match the active filters/);
  assert.match(app, /No release notes match these filters/);
});

test("filterGroupsByFeatureIds preserves caller order and drops unknowns", () => {
  const ids = new Set(["other-2026-14-detail", "bluetooth-menu-2026-14-detail"]);
  const filtered = filterGroupsByFeatureIds(sampleGroups, ids);
  assert.deepEqual(
    filtered.map((g) => g.title),
    ["Bluetooth Menu", "Other Feature"]
  );
  assert.deepEqual(filterGroupsByFeatureIds(sampleGroups, new Set()), []);
});

test("list month headings include year for both all-years and single-year modes", () => {
  const allYearsGrouped = groupChartDetailRows(
    collectChartDetailRows(
      sampleGroups,
      resolveDetailScope(
        { category: "Connectivity" },
        { category: "all", year: "all", version: "all", search: "" }
      )
    ),
    { year: "all" }
  );
  const oneYearGrouped = groupChartDetailRows(
    collectChartDetailRows(
      sampleGroups,
      resolveDetailScope(
        { category: "Connectivity" },
        { category: "all", year: "2026", version: "all", search: "" }
      )
    ),
    { year: "2026" }
  );

  const allFlat = flattenDetailMonths(allYearsGrouped);
  const oneFlat = flattenDetailMonths(oneYearGrouped);

  assert.ok(allFlat.every((m) => /\b20\d{2}\b/.test(m.headingLabel) || m.month == null));
  assert.ok(oneFlat.every((m) => /\b20\d{2}\b/.test(m.headingLabel) || m.month == null));
  assert.equal(oneFlat[0].headingLabel, "May 2026");

  // Same month in both views uses the same heading + row date fields
  const mayAll = allFlat.find((m) => m.headingLabel === "May 2026");
  const mayOne = oneFlat.find((m) => m.headingLabel === "May 2026");
  assert.ok(mayAll && mayOne);
  assert.equal(mayAll.otas[0].version, mayOne.otas[0].version);
  assert.equal(mayAll.otas[0].releaseDate, mayOne.otas[0].releaseDate);
  assert.equal(mayAll.otas[0].features[0].title, mayOne.otas[0].features[0].title);
});

test("app list render uses one shared flatten path", () => {
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(app, /flattenDetailMonths/);
  assert.match(app, /One path for all-years and specific-year/);
  assert.doesNotMatch(app, /chart-detail-year-title/);
});

test("pagination is not part of this app — full filtered set is rendered", () => {
  // Documented limitation: no pageSize/offset; both layouts render the full result set.
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.doesNotMatch(app, /pageSize|pagination|infiniteScroll/);
});
