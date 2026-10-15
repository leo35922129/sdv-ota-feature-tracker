/**
 * Local-only persistence for admin review overlays.
 * Not served as public Pages JSON. Writes require an admin session.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ADMIN_DIR = join(__dirname, "..", "data", "admin");
export const CANDIDATES_PATH = join(ADMIN_DIR, "image-candidates.json");
export const DECISIONS_PATH = join(ADMIN_DIR, "image-decisions.json");
export const RECOMMENDATIONS_PATH = join(ADMIN_DIR, "recommendations.json");

function loadDoc(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function saveDoc(path, doc) {
  mkdirSync(ADMIN_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
}

export function loadCandidatesDoc() {
  return loadDoc(CANDIDATES_PATH, { version: 1, candidates: [] });
}

export function saveCandidatesDoc(doc) {
  saveDoc(CANDIDATES_PATH, { version: 1, candidates: doc.candidates || [] });
}

export function loadDecisionsDoc() {
  return loadDoc(DECISIONS_PATH, { version: 1, decisions: [] });
}

export function saveDecisionsDoc(doc) {
  saveDoc(DECISIONS_PATH, { version: 1, decisions: doc.decisions || [] });
}

export function loadRecommendationsDoc() {
  return loadDoc(RECOMMENDATIONS_PATH, { version: 1, items: [] });
}

export function saveRecommendationsDoc(doc) {
  saveDoc(RECOMMENDATIONS_PATH, { version: 1, items: doc.items || [] });
}

export function upsertDecision(decision) {
  const doc = loadDecisionsDoc();
  const idx = doc.decisions.findIndex((d) => d.featureId === decision.featureId);
  if (idx >= 0) doc.decisions[idx] = { ...doc.decisions[idx], ...decision };
  else doc.decisions.push(decision);
  saveDecisionsDoc(doc);
  return doc.decisions.find((d) => d.featureId === decision.featureId);
}

export function candidatesForFeature(featureId) {
  return (loadCandidatesDoc().candidates || []).filter(
    (c) => c.featureId === featureId
  );
}

export function addCandidates(incoming = []) {
  const doc = loadCandidatesDoc();
  const seen = new Set(doc.candidates.map((c) => c.candidateId));
  for (const c of incoming) {
    if (!c?.candidateId || seen.has(c.candidateId)) continue;
    seen.add(c.candidateId);
    doc.candidates.push(c);
  }
  saveCandidatesDoc(doc);
  return doc.candidates;
}

export function appendRecommendation(item) {
  const doc = loadRecommendationsDoc();
  doc.items.push(item);
  saveRecommendationsDoc(doc);
  return item;
}
