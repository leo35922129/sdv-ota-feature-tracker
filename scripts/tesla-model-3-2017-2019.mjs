#!/usr/bin/env node
/**
 * Import Tesla Model 3 SOP/OTA features (2017–2019) from the Feature-Level List CSV
 * into data/releases.json using the existing Tesla feature schema.
 *
 * Usage: node scripts/tesla-model-3-2017-2019.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTeslaFeatureTags } from "./category-aliases.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const CSV = join(DATA, "tesla-model-3-2017-2019.csv");
const CACHE = join(DATA, "tesla-model-3-2017-2019-features.json");
const MANIFEST = join(DATA, "tesla-model-3-2017-2019-image-manifest.json");
const RELEASES = join(DATA, "releases.json");

export const SOURCE = "tesla-model-3-2017-2019";
export const SOURCE_LABEL =
  "Tesla Model 3 historical SOP/OTA feature list (2017–2019)";

const CATEGORIES = [
  "Vehicle OS",
  "Autopilot / Full Self-Driving",
  "Mobile App",
  "Profile",
  "Range / Charging / Energy",
  "Vehicle Control",
  "Comfort / Climate",
  "Interior Cabin",
  "Connectivity",
  "Media / Entertainment",
  "Audio",
  "Map / Navigation / Trip / Route",
  "Camera",
  "Lighting",
  "Display",
  "Performance",
  "Phone Call",
  "Security",
  "Voice & AI",
  "Trailering",
  "Gaming",
  "Productivity",
  "Safety / Emergency",
  "Service / Support",
  "UI / Visualization",
  "Onboarding / Tutorial",
  "Scenario / Mode",
];

/** Primary first. Only existing taxonomy names. */
const CATEGORY_BY_FEATURE = {
  "15-inch horizontal touchscreen": ["Display", "UI / Visualization"],
  "Navigation with real-time traffic": ["Map / Navigation / Trip / Route"],
  "Bluetooth hands-free calling and media streaming": [
    "Phone Call",
    "Connectivity",
  ],
  "Onboard Wi-Fi and LTE connectivity": ["Connectivity"],
  "Rearview camera": ["Camera"],
  "Automatic Emergency Braking": ["Safety / Emergency"],
  "Traffic-Aware Cruise Control and Autosteer": [
    "Autopilot / Full Self-Driving",
  ],
  "Automatic lane change and Autopark": ["Autopilot / Full Self-Driving"],
  "Camper Mode": ["Scenario / Mode", "Comfort / Climate"],
  "TPMS updates": ["Vehicle Control"],
  "Seat-belt warning menu": ["Safety / Emergency", "UI / Visualization"],
  "Odometer and power-consumption display": [
    "Map / Navigation / Trip / Route",
    "Range / Charging / Energy",
  ],
  "Air-vent GUI": ["Comfort / Climate", "UI / Visualization"],
  "Chill acceleration mode": ["Performance", "Vehicle Control"],
  "FM radio activation": ["Audio"],
  "Persistent wiper control": ["Vehicle Control"],
  "Immersive Sound audio setting": ["Audio"],
  "USB control in Audio": ["Audio"],
  "Voice-activated bug report": ["Voice & AI", "Service / Support"],
  "Automatic windshield wipers": ["Vehicle Control"],
  "Rear heated seats": ["Comfort / Climate"],
  "Automatic Emergency Braking update": ["Safety / Emergency"],
  "Phone-based vehicle unlocking changes": ["Mobile App", "Security"],
  "Automatic high beams": ["Lighting", "Autopilot / Full Self-Driving"],
  "Braking-distance improvement": ["Vehicle Control", "Safety / Emergency"],
  "Model 3 Wi-Fi connectivity": ["Connectivity"],
  "Cabin Overheat Protection": ["Comfort / Climate", "Safety / Emergency"],
  "Summon for eligible Enhanced Autopilot vehicles": [
    "Autopilot / Full Self-Driving",
  ],
  "PIN to Drive": ["Security"],
  "Version 9.0 touchscreen refresh": ["UI / Visualization"],
  "Navigate on Autopilot Beta": [
    "Autopilot / Full Self-Driving",
    "Map / Navigation / Trip / Route",
  ],
  "Combined Autosteer and Auto Lane Change": [
    "Autopilot / Full Self-Driving",
  ],
  "Blind Spot Warning": ["Safety / Emergency", "Autopilot / Full Self-Driving"],
  Dashcam: ["Camera"],
  "Mobile app navigation sharing": [
    "Mobile App",
    "Map / Navigation / Trip / Route",
  ],
  "Mobile app software-update initiation": ["Mobile App", "Vehicle OS"],
  "Application launcher": ["UI / Visualization"],
  "Calendar app": ["Productivity"],
  "Energy app": ["Range / Charging / Energy"],
  "Web browser": ["Media / Entertainment"],
  "Climate-control gesture interface": ["Comfort / Climate", "UI / Visualization"],
  "Navigation redesign": ["Map / Navigation / Trip / Route", "UI / Visualization"],
  "HOV-lane routing preference": ["Map / Navigation / Trip / Route"],
  "Traffic view restyling": [
    "Map / Navigation / Trip / Route",
    "UI / Visualization",
  ],
  "Keep Climate On": ["Scenario / Mode", "Comfort / Climate"],
  "Romance Mode": ["Media / Entertainment", "Scenario / Mode"],
  "Emissions Testing Mode": ["Media / Entertainment", "Scenario / Mode"],
  "Pole Position": ["Gaming"],
  "TeslAtari USB game-controller support": ["Gaming"],
  "Sentry Mode": ["Security", "Camera"],
  "Dog Mode": ["Comfort / Climate", "Scenario / Mode"],
  "Peak Power Increase": ["Performance"],
  "Dynamic Brake Lights": ["Lighting", "Safety / Emergency"],
  "Autosteer Stop Light Warning": [
    "Autopilot / Full Self-Driving",
    "Safety / Emergency",
  ],
  "Enhanced Summon": ["Autopilot / Full Self-Driving"],
  "Trip Planner Beta": ["Map / Navigation / Trip / Route"],
  "Software Update Controls": ["Vehicle OS", "Service / Support"],
  "TeslAtari improvements": ["Gaming"],
  "Supercharging improvements": ["Range / Charging / Energy"],
  "On-Route Battery Warmup": ["Range / Charging / Energy"],
  "Dashcam side-camera recording": ["Camera"],
  "Auto High Beam": ["Lighting"],
  "Tire Pressure Monitoring reset": ["Vehicle Control"],
  "CHAdeMO Adapter Support": ["Range / Charging / Energy"],
  "Sketchpad improvements": ["Productivity", "Media / Entertainment"],
  "Autosteer on limited-access roads": ["Autopilot / Full Self-Driving"],
  "Application Launcher reorganization": ["UI / Visualization", "Gaming"],
  "Smart Summon Beta": ["Autopilot / Full Self-Driving", "Mobile App"],
  "Stopping Mode: Hold": ["Vehicle Control"],
  "Scheduled Departure": ["Range / Charging / Energy", "Comfort / Climate"],
  "Model 3 power increase": ["Performance"],
  "Driving Visualization improvements": [
    "UI / Visualization",
    "Autopilot / Full Self-Driving",
  ],
  "Voice Commands": ["Voice & AI"],
  "Phone text messaging": ["Phone Call", "Connectivity"],
  "Camp Mode": ["Scenario / Mode", "Comfort / Climate"],
  "TRAX v0.1": ["Media / Entertainment", "Gaming"],
};

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  const src = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => String(x).trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    if (row.some((x) => String(x).trim())) rows.push(row);
  }
  return rows;
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function formatReleaseDate(approx) {
  const s = String(approx || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return s;
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
  return `${months[Number(iso[2]) - 1]} ${Number(iso[3])}, ${iso[1]}`;
}

export function availabilityFromCaveat(caveat) {
  const t = String(caveat || "").toLowerCase();
  if (
    /owner-reported|owner-maintained|uncertain|not independently confirmed|archive date is unreliable/.test(
      t
    )
  ) {
    return "Owner-reported / uncertain";
  }
  if (/\bbeta\b/.test(t)) return "Beta / limited rollout";
  if (/optional|enhanced autopilot|package/.test(t)) {
    return "Optional / hardware-dependent";
  }
  if (/region|market/.test(t)) return "Region-dependent";
  if (/hardware|configuration|adapter|installed audio/.test(t)) {
    return "Hardware-dependent";
  }
  if (/standard launch|standard equipment/.test(t)) return "Launch equipment";
  return "Historical / applicability varies";
}

export function categoriesForFeature(name) {
  const mapped = CATEGORY_BY_FEATURE[name];
  if (!mapped?.length) {
    throw new Error(`No category mapping for feature: ${name}`);
  }
  const tagged = normalizeTeslaFeatureTags({
    categories: mapped,
    primaryCategory: mapped[0],
  });
  return tagged.categories;
}

function featureId(type, version, name, used) {
  const base = `tesla-model-3-${String(type).toLowerCase()}-${slugify(version)}-${slugify(name)}`;
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n++;
  }
  used.add(id);
  return id;
}

function csvRecords(csvText) {
  const rows = parseCsv(csvText);
  const header = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))
  );
}

export function rowsToPayload(records) {
  const used = new Set();
  const features = [];
  const releasesMap = new Map();

  for (const row of records) {
    const kind = String(row.Type || "").trim();
    const version = String(row["Version / SOP"] || "").trim();
    const title = String(row.Feature || "").trim();
    const notes = String(row["Detailed Release Notes"] || "").trim();
    const caveat = String(row["Scope / Eligibility / Caveat"] || "").trim();
    const sourceUrl = String(row["Source URL"] || "").trim();
    if (!kind || !version || !title || !notes) {
      throw new Error(`Incomplete source row: ${JSON.stringify(row)}`);
    }
    const categories = categoriesForFeature(title);
    const releaseDate = formatReleaseDate(row["Approx. Date"]);
    const description = caveat ? `${notes}\n\n${caveat}` : notes;
    const id = featureId(kind, version, title, used);
    const feature = {
      id,
      title,
      type: kind.toLowerCase() === "sop" ? "sop" : "ota",
      description,
      image: null,
      imageDark: null,
      links: sourceUrl ? [{ title: "Source", url: sourceUrl }] : [],
      availability: availabilityFromCaveat(caveat),
      models: ["3"],
      categories,
      primaryCategory: categories[0],
      source: SOURCE,
      version,
      releaseDate,
      releaseUrl: sourceUrl || null,
      year: Number(row.Year) || null,
      importKind: kind,
    };
    features.push(feature);

    if (!releasesMap.has(version)) {
      releasesMap.set(version, {
        version,
        url: sourceUrl || "",
        releaseDate,
        features: [],
        source: SOURCE,
      });
    }
    const release = releasesMap.get(version);
    release.features.push({
      id: feature.id,
      title: feature.title,
      type: feature.type,
      description: feature.description,
      image: null,
      imageDark: null,
      links: feature.links,
      availability: feature.availability,
      models: ["3"],
      categories: feature.categories,
      primaryCategory: feature.primaryCategory,
      source: SOURCE,
    });
  }

  return {
    source: SOURCE,
    sourceFile: "data/tesla-model-3-2017-2019.csv",
    scrapedAt: new Date().toISOString(),
    featureCount: features.length,
    releaseCount: releasesMap.size,
    releases: [...releasesMap.values()],
    features,
  };
}

export function loadModel3Cache() {
  if (!existsSync(CACHE)) return null;
  try {
    return JSON.parse(readFileSync(CACHE, "utf8"));
  } catch {
    return null;
  }
}

function nestedCard(f) {
  return {
    id: f.id,
    title: f.title,
    type: f.type,
    description: f.description,
    image: f.image ?? null,
    imageDark: f.imageDark ?? null,
    links: f.links || [],
    availability: f.availability || null,
    models: f.models || ["3"],
    categories: f.categories,
    primaryCategory: f.primaryCategory,
    source: SOURCE,
  };
}

function recount(payload) {
  const features = payload.features || [];
  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const f of features) {
    for (const c of f.categories || []) {
      if (categoryCounts[c] != null) categoryCounts[c]++;
    }
  }
  return {
    ...payload,
    categories: payload.categories || CATEGORIES,
    categoryCounts,
    featureCount: features.length,
    releaseCount: (payload.releases || []).length,
  };
}

export function stripModel3Historical(payload) {
  if (!payload) return payload;
  const features = (payload.features || []).filter((f) => f.source !== SOURCE);
  const releases = (payload.releases || [])
    .map((rel) => {
      if (rel.source === SOURCE) return null;
      const feats = (rel.features || []).filter((f) => f.source !== SOURCE);
      if (feats.length === (rel.features || []).length) return rel;
      if (!feats.length && rel.source === SOURCE) return null;
      return { ...rel, features: feats };
    })
    .filter(Boolean);
  return recount({ ...payload, features, releases });
}

export function mergeModel3Historical(model3Payload, releasesData) {
  if (!releasesData || !model3Payload?.features?.length) return releasesData;
  const base = stripModel3Historical(releasesData);
  const releases = [...(base.releases || [])];
  const byVersion = new Map(releases.map((r) => [String(r.version), r]));
  const knownIds = new Set((base.features || []).map((f) => f.id));
  const newFeatures = [];

  for (const f of model3Payload.features) {
    if (knownIds.has(f.id)) continue;
    knownIds.add(f.id);
    newFeatures.push({
      ...f,
      source: SOURCE,
      models: ["3"],
    });
    let rel = byVersion.get(String(f.version));
    if (!rel) {
      rel = {
        version: f.version,
        url: f.releaseUrl || "",
        releaseDate: f.releaseDate,
        features: [],
        source: SOURCE,
      };
      releases.push(rel);
      byVersion.set(String(f.version), rel);
    }
    if (!(rel.features || []).some((x) => x.id === f.id)) {
      rel.features = [...(rel.features || []), nestedCard(f)];
    }
  }

  return recount({
    ...base,
    features: [...(base.features || []), ...newFeatures],
    releases,
    sources: [
      ...new Set([
        ...(base.sources || [base.source].filter(Boolean)),
        SOURCE_LABEL,
      ]),
    ],
    model3Historical: {
      source: SOURCE,
      addedFeatures: newFeatures.length,
      addedReleases: model3Payload.releaseCount,
    },
  });
}

export function retainModel3Historical(
  previous,
  next,
  cache = loadModel3Cache()
) {
  if (!next) return next;
  const has = (next.features || []).some((f) => f.source === SOURCE);
  if (has) return next;
  if (cache?.features?.length) return mergeModel3Historical(cache, next);
  const prevFeat = (previous?.features || []).filter((f) => f.source === SOURCE);
  if (!prevFeat.length) return next;
  return mergeModel3Historical(
    {
      features: prevFeat,
      releases: (previous.releases || []).filter((r) => r.source === SOURCE),
      releaseCount: prevFeat.length,
    },
    next
  );
}

export function imageManifestFromPayload(payload) {
  return {
    generatedAt: new Date().toISOString(),
    reviewStatusDefault: "needs-review",
    rows: (payload.features || []).map((f) => ({
      id: f.id,
      title: f.title,
      image: null,
      imageDark: null,
      altText: f.title,
      imageSource: null,
      credit: null,
      license: null,
      confidence: "none",
      reviewStatus: "needs-review",
      notes: "No verified feature-specific image; using existing placeholder.",
    })),
  };
}

export function importFromCsv(csvText = readFileSync(CSV, "utf8")) {
  const records = csvRecords(csvText);
  if (records.length !== 77) {
    throw new Error(`Expected 77 Feature-Level List rows, got ${records.length}`);
  }
  return rowsToPayload(records);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  mkdirSync(DATA, { recursive: true });
  const payload = importFromCsv();
  writeFileSync(CACHE, JSON.stringify(payload, null, 2));
  writeFileSync(MANIFEST, JSON.stringify(imageManifestFromPayload(payload), null, 2));
  const current = JSON.parse(readFileSync(RELEASES, "utf8"));
  const first = mergeModel3Historical(payload, current);
  const second = mergeModel3Historical(payload, first);
  const ids = (p) =>
    (p.features || [])
      .filter((f) => f.source === SOURCE)
      .map((f) => f.id)
      .sort();
  if (ids(first).length !== 77) {
    throw new Error("Did not import 77 Model 3 historical features");
  }
  if (ids(first).join() !== ids(second).join()) {
    throw new Error("Import is not idempotent");
  }
  writeFileSync(RELEASES, JSON.stringify(first, null, 2));
  console.log(
    `Imported 77 Model 3 features (${payload.releaseCount} version groups) into ${RELEASES}`
  );
}
