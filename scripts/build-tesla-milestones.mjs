#!/usr/bin/env node
/**
 * Build data/tesla-milestones.json from the Tesla OTA / SORP CSV folders.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SORP_CATEGORIES, isOtaAddedSorpRow, ALL_MODELS_OVERVIEW } from "./tesla-milestones.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HOME = process.env.HOME;
const OTA_DIR = join(
  HOME,
  "Library/CloudStorage/OneDrive-GeneralMotors/Desktop/Tesla OTA"
);
const SORP_DIRS = {
  "3": join(
    HOME,
    "Library/CloudStorage/OneDrive-GeneralMotors/Desktop/Model_3_SORP_Hardware_and_Software_CSV"
  ),
  Y: join(
    HOME,
    "Library/CloudStorage/OneDrive-GeneralMotors/Desktop/Model_Y_SORP_Hardware_and_Detailed_Software_Features_CSV"
  ),
  S: join(
    HOME,
    "Library/CloudStorage/OneDrive-GeneralMotors/Desktop/Model_S_SORP_Hardware_and_Software_CSV"
  ),
  X: join(
    HOME,
    "Library/CloudStorage/OneDrive-GeneralMotors/Desktop/Model_X_SORP_Hardware_and_Software_CSV"
  ),
  CT: join(
    HOME,
    "Library/CloudStorage/OneDrive-GeneralMotors/Desktop/Cybertruck_SORP_Hardware_and_Software_CSV"
  ),
};

const OTA_FILES = {
  "3": "Model 3 OTA milestone features.csv",
  Y: "Model Y OTA milestones fearures.csv",
  S: "Model S OTA milestones.csv",
  X: "Model X OTA milestone features.csv",
  CT: "Cybertruck OTA milestones.csv",
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const src = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => String(x).trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((x) => String(x).trim())) rows.push(row);
  }
  return rows;
}

function classifySorpCategory(name) {
  const n = name.toLowerCase();
  if (n.includes("software feature")) return "software-features";
  if (n.includes("vehicle") && n.includes("packag")) return "vehicle-packaging";
  else if (n.includes("cabin") && n.includes("comfort")) return "cabin-comfort";
  else if (n.includes("safety")) return "safety-driver";
  else if (n.includes("charging") || n.includes("thermal") || n.includes("energy")) {
    return "charging-thermal";
  } else if (n.includes("performance") || n.includes("optional")) {
    return "performance-packages";
  }
  return null;
}

function parseOtaCsv(text) {
  const rows = parseCsv(text);
  const header = (rows[0] || []).map((h) => h.trim().toLowerCase());
  const vi = header.findIndex((h) => h.includes("version") || h.includes("date"));
  const fi = header.findIndex((h) => h.includes("milestone") && !h.includes("significance"));
  const si = header.findIndex((h) => h.includes("significance"));
  const out = [];
  for (const row of rows.slice(1)) {
    const version = (row[vi] || "").trim();
    if (!version) continue;
    out.push({
      version,
      featuresText: (row[fi >= 0 ? fi : 1] || "").trim(),
      significance: (row[si >= 0 ? si : 2] || "").trim(),
    });
  }
  return out;
}

function parseSorpCsv(text) {
  const rows = parseCsv(text);
  const columns = (rows[0] || [])
    .map((h) => String(h || "").trim())
    .filter(Boolean);
  const outRows = [];
  for (const row of rows.slice(1)) {
    const cells = columns.map((_, i) => String(row[i] || "").trim());
    if (!cells[0]) continue;
    const parsed = {
      category: cells[0],
      detail: cells[1] || "",
      cells,
    };
    if (isOtaAddedSorpRow(parsed, columns)) continue;
    outRows.push(parsed);
  }
  return {
    columns: columns.length ? columns : ["Category", "Initial SOP feature"],
    rows: outRows,
  };
}

function main() {
  const models = {};
  for (const [id, file] of Object.entries(OTA_FILES)) {
    const path = join(OTA_DIR, file);
    models[id] = {
      id,
      milestones: parseOtaCsv(readFileSync(path, "utf8")),
      sorp: {},
    };
  }

  for (const [id, dir] of Object.entries(SORP_DIRS)) {
    if (!models[id]) models[id] = { id, milestones: [], sorp: {} };
    for (const name of readdirSync(dir)) {
      if (!name.toLowerCase().endsWith(".csv")) continue;
      const category = classifySorpCategory(name);
      if (!category) {
        console.warn("Unclassified SORP file:", id, name);
        continue;
      }
      models[id].sorp[category] = parseSorpCsv(readFileSync(join(dir, name), "utf8"));
    }
  }

  const payload = {
    schemaVersion: 1,
    source: "Tesla OTA milestone and SORP feature lists",
    categories: SORP_CATEGORIES,
    allModels: ALL_MODELS_OVERVIEW,
    models,
  };
  mkdirSync(join(ROOT, "data"), { recursive: true });
  const out = join(ROOT, "data", "tesla-milestones.json");
  writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  const counts = Object.entries(models).map(
    ([id, m]) => `${id}:${m.milestones.length}m/${Object.keys(m.sorp).length}c`
  );
  console.log("Wrote", out, counts.join(" "));
}

main();
