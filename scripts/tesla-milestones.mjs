/**
 * Tesla OTA milestone + SORP helpers (browser-safe).
 * Data lives in data/tesla-milestones.json.
 */

export const MILESTONE_MODELS = [
  { id: "3", label: "Model 3" },
  { id: "Y", label: "Model Y" },
  { id: "S", label: "Model S" },
  { id: "X", label: "Model X" },
  { id: "CT", label: "Cybertruck" },
];

export const SORP_CATEGORIES = [
  { id: "vehicle-packaging", label: "Vehicle and Packaging" },
  { id: "cabin-comfort", label: "Cabin and Comfort" },
  { id: "safety-driver", label: "Safety and Driver Assistance" },
  { id: "charging-thermal", label: "Charging and Thermal Systems" },
  { id: "performance-packages", label: "Performance and Optional Packages" },
  { id: "software-features", label: "Software Features" },
];

export const ALL_MODELS_OVERVIEW = {
  milestones: [
    {
      year: 2026,
      version: "Ongoing",
      significance: "Continuous energy, media, safety, and service refinement",
      detail:
        "Across all programs, OTA keeps tuning range prediction, charging, thermal preparation, cabin UX, camera features, safety logic, media, and diagnostics.",
      featuresText: "All models, OTA loop, Continuous",
    },
    {
      year: 2024,
      version: "2024+",
      significance: "FSD Supervised becomes the end-to-end assistance layer",
      detail:
        "End-to-end supervised driving, broader visualization, and continued parking/road-function expansion become the primary advanced-ADAS storyline.",
      featuresText: "FSD, HW / region, Supervised",
    },
    {
      year: 2023,
      version: "2023–24",
      significance: "Cybertruck utility software arrives",
      detail:
        "OTA becomes part of truck ownership: Vault/tonneau controls, Powershare, towing, suspension modes, steering behavior, and work/utility power flows.",
      featuresText: "Cybertruck, Towing, Powershare",
    },
    {
      year: 2023,
      version: "2023",
      significance: "Tesla Vision Park Assist",
      detail:
        "Camera-based parking visualization becomes a major OTA-visible transition as Tesla removes or de-emphasizes ultrasonic sensing on newer builds.",
      featuresText: "Vision, Park Assist, 3 / Y / CT",
    },
    {
      kind: "model-launch",
      year: 2023,
      version: "Cybertruck",
      significance:
        "Tesla’s distinctive electric pickup designed to blend rugged utility, strong towing capability, and sports-car-like performance.",
    },
    {
      year: 2021,
      version: "2021–22",
      significance: "Cabin-camera monitoring + richer media",
      detail:
        "Attention monitoring, connected entertainment, games, rear displays, and refresh-generation compute deepen the cabin software layer.",
      featuresText: "S / X / 3 / Y, Cabin cam, Media",
    },
    {
      year: 2020,
      version: "2020–21",
      significance: "FSD Beta and Tesla Vision transition",
      detail:
        "FSD Beta expands on compatible compute/camera hardware while Tesla shifts selected perception and parking functions away from radar/USS.",
      featuresText: "FSD, Vision, HW gate",
    },
    {
      kind: "model-launch",
      year: 2020,
      version: "Model Y",
      significance:
        "Tesla’s versatile electric SUV that combines sedan-like driving dynamics with increased cargo space and family-friendly practicality.",
    },
    {
      year: 2019,
      version: "2019–20",
      significance: "Smart Summon + traffic-control functions",
      detail:
        "Remote low-speed maneuvering and Traffic Light/Stop Sign Control extend the assistance stack into more complex environments.",
      featuresText: "FSD gate, Summon, ADAS",
    },
    {
      year: 2019,
      version: "2019",
      significance: "Sentry Mode, Dashcam, Dog Mode, Theater",
      detail:
        "Exterior cameras, local storage, cabin climate, media, and parked-use scenarios expand the vehicle’s value after delivery.",
      featuresText: "S / X / 3 / Y, Security, Lifestyle",
    },
    {
      year: 2018,
      version: "2018",
      significance: "Navigate on Autopilot + performance software",
      detail:
        "Route-level assisted driving, automated lane-change behavior, and performance features show software reaching beyond basic controls.",
      featuresText: "S / X / 3, EAP, Performance",
    },
    {
      year: 2017,
      version: "2017",
      significance: "Model 3 makes OTA the primary cabin UX",
      detail:
        "The central touchscreen becomes the dominant vehicle interface for climate, navigation, charging, media, profiles, and settings.",
      featuresText: "Model 3, UX, Profiles",
    },
    {
      kind: "model-launch",
      year: 2017,
      version: "Model 3",
      significance:
        "Tesla’s sporty electric sedan offering efficient performance, long range, and a technology-focused interior at Tesla’s more accessible price point.",
    },
    {
      kind: "model-launch",
      year: 2015,
      version: "Model X",
      significance:
        "Tesla’s premium electric SUV focused on passenger space, cargo versatility, towing capability, and distinctive falcon wing doors.",
    },
    {
      year: 2014,
      version: "2014–16",
      significance: "Autopilot + low-speed automation",
      detail:
        "Traffic-Aware Cruise Control, Autosteer, lane-change evolution, Autopark, and Summon begin the driver-assistance feature ladder.",
      featuresText: "S / X, ADAS, Summon",
    },
    {
      year: 2012,
      version: "2012–14",
      significance: "Connected ownership foundation",
      detail:
        "Remote vehicle status and controls, navigation, charging visibility, and early OTA delivery establish the software-defined ownership loop.",
      featuresText: "Model S, Energy, Remote app",
    },
    {
      kind: "model-launch",
      year: 2012,
      version: "Model S",
      significance:
        "Tesla’s high-performance luxury sedan, combining long-distance range with exceptional acceleration and premium technology.",
    },
  ],
  sorp: {
    columns: ["Category", "Model S", "Model X", "Model 3", "Model Y", "Cybertruck"],
    rows: [
      {
        category: "Launch date",
        cells: [
          "Launch date",
          "June 2012. Original Signature-series liftback; 2021 refresh adds yoke/landscape cabin.",
          "September 2015. Three-row SUV launch; 2021 refresh adds yoke/rear display.",
          "July 2017. Compact sedan launch, initially Long Range RWD.",
          "March 2020. Compact crossover launch, initially Long Range AWD / Performance AWD.",
          "November 2023. Foundation Series AWD/Cyberbeast launch with later trim expansion.",
        ],
      },
      {
        category: "Vehicle type",
        cells: [
          "Vehicle type",
          "Premium liftback. 2012 → refresh. Premium long-range liftback; cluster-led legacy cabin evolves into refresh yoke/landscape experience.",
          "Family SUV. 2015 → refresh. Family SUV with Falcon Wing doors, three-row flexibility, and the highest closure/packaging complexity.",
          "Mass-market sedan. 2017 → later generations. Compact sedan that normalized the central-screen, software-first, lower-cost Tesla UX.",
          "Crossover. 2020 → multiple factories. Crossover scale-up with hatch utility and heat-pump/Octovalve thermal architecture at launch.",
          "Utility pickup. 2023 → expanding trims. Utility platform defined by exoskeleton, steer-by-wire, rear steering, towing, and export power.",
        ],
      },
      {
        category: "Primary mission",
        cells: [
          "Primary mission",
          "Executive long range. Liftback cargo and premium performance.",
          "Family utility. Three rows, powered Falcon Wing doors, towing.",
          "Accessible EV sedan. Efficiency, compact footprint, software-first interface.",
          "High-volume crossover. Hatch utility, elevated seating, family flexibility.",
          "Work / adventure. Vault bed, towing, off-road, export power.",
        ],
      },
      {
        category: "Signature hardware",
        cells: [
          "Signature hardware",
          "Liftback + underfloor pack. Low center of gravity and large rear access.",
          "Falcon Wing doors. Three-row package and panoramic windshield.",
          "15-inch landscape UX. Central-screen controls with compact sedan packaging.",
          "Hatch + heat pump. Octovalve/heat-pump architecture from launch.",
          "Exoskeleton + steer-by-wire. Rear steering, adaptive air, 48V architecture, Vault.",
        ],
      },
      {
        category: "Cabin differentiator",
        cells: [
          "Cabin differentiator",
          "Cluster + premium cabin. Portrait legacy / landscape refresh; yoke on refresh.",
          "Three-row comfort. Rear display on refresh; large cabin air/filtration content.",
          "Minimalist sedan. No separate traditional cluster; central display carries driving UX.",
          "Elevated five-seat crossover. Hatch packaging and optional later seven-seat configuration.",
          "Front + rear screens. Utility-focused cabin with rear display and large glass roof.",
        ],
      },
      {
        category: "Charging / thermal",
        cells: [
          "Charging / thermal",
          "Legacy → refresh evolution. Liquid battery cooling; later heat-pump refresh.",
          "Large-SUV thermal load. Liquid battery cooling; towing and cabin size matter.",
          "Efficiency scaling. Liquid battery cooling; resistive heater at original SOP, heat pump later.",
          "Heat pump at launch. Integrated Octovalve/heat-pump thermal architecture.",
          "High-power utility. NACS, fast charging, Powershare/export, thermal/towing coordination.",
        ],
      },
      {
        category: "Performance / options",
        cells: [
          "Performance / options",
          "P / Ludicrous / Plaid. From early performance packs to refresh tri-motor Plaid.",
          "P / Ludicrous / Plaid. AWD performance SUV; tow, wheel, and seat packages.",
          "AWD / Performance. Later dual motor, Performance, Sport wheels, FSD package.",
          "AWD / Performance. Long Range AWD, Performance, 20/21-inch wheels, tow.",
          "AWD / Cyberbeast / RWD. 35-inch AT tires, tow, range extender, Foundation.",
        ],
      },
      {
        category: "OTA leverage",
        cells: [
          "OTA leverage",
          "Retrofitted evolution. Strong feature spread across MCU, Autopilot, radar/USS, and FSD generations.",
          "Retrofitted evolution. Same software lineage, with powered-door and three-row hardware gates.",
          "Software-first baseline. High OTA exposure through central display and camera/compute evolution.",
          "Software-first crossover. Heat-pump, camera, compute, and connected-service updates.",
          "Utility software layer. OTA controls truck power, suspension, steering, towing, and bed functions.",
        ],
      },
    ],
  },
};

export function allModelsOverview(doc) {
  return doc?.allModels || ALL_MODELS_OVERVIEW;
}

export function splitMilestoneFeatures(text) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;]+\s*$/, "");
  if (!cleaned) return [];
  return cleaned
    .split(",")
    .map((part) =>
      part
        .trim()
        .replace(/^and\s+/i, "")
        .replace(/[.;]+\s*$/, "")
    )
    .filter(Boolean);
}

export function yearFromMilestoneVersion(version) {
  const match = String(version || "").match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

export function milestoneVersionParts(version) {
  return [...String(version || "").matchAll(/\d+/g)].map((m) => Number(m[0]));
}

export function compareMilestoneVersions(a, b) {
  const pa = milestoneVersionParts(a);
  const pb = milestoneVersionParts(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export function groupMilestonesByYear(entries) {
  const byYear = new Map();
  for (const entry of entries || []) {
    const year = yearFromMilestoneVersion(entry.version);
    if (!year) continue;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push({
      ...entry,
      features: splitMilestoneFeatures(entry.featuresText),
    });
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, items]) => ({
      year,
      items: items.sort((a, b) => compareMilestoneVersions(a.version, b.version)),
    }));
}

export function groupOverviewMilestones(entries) {
  const byYear = new Map();
  for (const entry of entries || []) {
    const year = Number(entry.year) || yearFromMilestoneVersion(entry.version);
    if (!year) continue;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push({
      ...entry,
      features: splitMilestoneFeatures(entry.featuresText),
    });
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, items]) => ({
      year,
      items: items.sort((a, b) => {
        const la = a.kind === "model-launch" ? 1 : 0;
        const lb = b.kind === "model-launch" ? 1 : 0;
        return la - lb;
      }),
    }));
}

export function modelMilestoneData(doc, modelId) {
  return doc?.models?.[modelId] || null;
}

export function isOtaAddedSorpRow(row, columns = []) {
  const cells = Array.isArray(row?.cells) && row.cells.length
    ? row.cells
    : [row?.category, row?.detail];
  const idx = columns.findIndex((c) => /availability|status/i.test(String(c)));
  const availability = String((idx >= 0 ? cells[idx] : cells[2]) || "").toLowerCase();
  return /\bota addition\b/.test(availability);
}

export function sorpRowsForCategory(modelData, categoryId) {
  const block = modelData?.sorp?.[categoryId];
  if (!block?.rows?.length) return [];
  return block.rows.filter((row) => !isOtaAddedSorpRow(row, block.columns || []));
}
