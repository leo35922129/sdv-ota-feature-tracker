#!/usr/bin/env node
/**
 * Tests for feature edit validation, persistence helpers, and upload checks.
 * Run: node --test scripts/feature-edits.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  EDITS_PATH,
  UPLOADS_DIR,
  validateFeatureEdit,
  upsertEdits,
  applyFeatureEdits,
  validateAndSaveUpload,
  loadEditsDoc,
  loadCanonicalCategories,
} from "./feature-edits.mjs";

const BACKUP = join(ROOT, "data", "feature-edits.test-backup.json");
const original = existsSync(EDITS_PATH)
  ? readFileSync(EDITS_PATH, "utf8")
  : null;

before(() => {
  if (original != null) writeFileSync(BACKUP, original);
  writeFileSync(
    EDITS_PATH,
    JSON.stringify({ version: 1, edits: [] }, null, 2) + "\n"
  );
});

after(() => {
  if (original != null) writeFileSync(EDITS_PATH, original);
  else writeFileSync(EDITS_PATH, JSON.stringify({ version: 1, edits: [] }, null, 2) + "\n");
  if (existsSync(BACKUP)) rmSync(BACKUP);
});

function sampleFeatureId() {
  const releases = JSON.parse(
    readFileSync(join(ROOT, "data", "releases.json"), "utf8")
  );
  const f = releases.features.find((x) => x.id && x.title);
  assert.ok(f, "expected at least one Tesla feature");
  return f;
}

test("canonical categories are loaded from releases.json", () => {
  const cats = loadCanonicalCategories("tesla");
  assert.ok(cats.includes("Lighting"));
  assert.ok(cats.includes("Vehicle OS"));
  assert.ok(cats.includes("Interior Cabin"));
  assert.ok(cats.includes("Connectivity"));
  assert.ok(cats.includes("Map / Navigation / Trip / Route"));
});

test("validate rejects empty title", () => {
  const f = sampleFeatureId();
  const result = validateFeatureEdit({
    ids: [f.id],
    title: "   ",
    description: "ok",
    categories: ["Lighting"],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /name cannot be empty/i.test(e)));
});

test("validate rejects invalid category names without normalizing", () => {
  const f = sampleFeatureId();
  const result = validateFeatureEdit({
    ids: [f.id],
    title: "Name",
    categories: ["lighting"], // wrong case — must not silently normalize
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /Invalid category/i.test(e)));
});

test("validate rejects unknown feature ids", () => {
  const result = validateFeatureEdit({
    ids: ["does-not-exist-feature-id"],
    title: "Name",
    categories: ["Lighting"],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /Unknown feature id/i.test(e)));
});

test("validate rejects duplicate category tags", () => {
  const f = sampleFeatureId();
  const result = validateFeatureEdit({
    ids: [f.id],
    title: "Name",
    categories: ["Lighting", "Lighting"],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /Duplicate category/i.test(e)));
});

test("upsert persists edit and applyFeatureEdits overlays fields", () => {
  const f = sampleFeatureId();
  const saved = upsertEdits({
    ids: [f.id],
    title: "Edited Feature Name",
    description: "Line one\nLine two",
    categories: ["Lighting"],
    image: "https://example.com/a.png",
    imageDark: "",
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.edits[0].id, f.id);

  const doc = loadEditsDoc();
  assert.ok(doc.edits.some((e) => e.id === f.id));

  const applied = applyFeatureEdits(
    [{ ...f, categories: ["Vehicle OS"], primaryCategory: "Vehicle OS" }],
    doc
  );
  assert.equal(applied[0].title, "Edited Feature Name");
  assert.equal(applied[0].description, "Line one\nLine two");
  assert.deepEqual(applied[0].categories, ["Lighting"]);
  assert.equal(applied[0].image, "https://example.com/a.png");
  assert.equal(applied[0].imageDark, null);
  assert.equal(applied[0].featureEdited, true);
});

test("dry-run upsert does not write", () => {
  const f = sampleFeatureId();
  const before = loadEditsDoc();
  const result = upsertEdits(
    {
      ids: [f.id],
      title: "Should Not Persist",
      categories: ["Display"],
    },
    { dryRun: true }
  );
  assert.equal(result.ok, true);
  const after = loadEditsDoc();
  assert.deepEqual(after, before);
});

test("upload validation accepts png magic bytes and rejects bad type", () => {
  mkdirSync(UPLOADS_DIR, { recursive: true });
  // Minimal PNG header + IHDR-ish bytes (enough for magic check)
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
  ]);
  const ok = validateAndSaveUpload({
    filename: "test.png",
    mime: "image/png",
    buffer: png,
  });
  assert.equal(ok.ok, true);
  assert.match(ok.url, /^\.\/data\/uploads\//);

  const bad = validateAndSaveUpload({
    filename: "x.txt",
    mime: "text/plain",
    buffer: Buffer.from("hi"),
  });
  assert.equal(bad.ok, false);
});

test("edit mode field priority: feature edit wins over prior categories", () => {
  const f = sampleFeatureId();
  upsertEdits({
    ids: [f.id],
    title: f.title,
    description: f.description || "",
    categories: ["Security", "Camera"],
  });
  const applied = applyFeatureEdits(
    [
      {
        ...f,
        categories: ["Vehicle OS"],
        primaryCategory: "Vehicle OS",
        categorySource: "override",
      },
    ],
    loadEditsDoc()
  );
  assert.deepEqual(applied[0].categories, ["Security", "Camera"]);
  assert.equal(applied[0].primaryCategory, "Security");
});

test("card images rewrite root-absolute uploads to relative paths", () => {
  const app = readFileSync(join(ROOT, "app.js"), "utf8");
  assert.match(app, /function publicImageSrc\(/);
  assert.match(app, /startsWith\("\/data\/uploads\/"\)\) return `\.\${value}`/);
  assert.match(app, /inheritEditedImagesByFeatureKey\(features\)/);
});

test("live data poll reloads brands through ensureBrandLoaded so overlays inherit", () => {
  const app = readFileSync(join(ROOT, "app.js"), "utf8");
  const start = app.indexOf("async function pollForDataUpdates");
  assert.notEqual(start, -1);
  const end = app.indexOf("\nasync function ", start + 1);
  const poll = app.slice(start, end === -1 ? undefined : end);
  assert.match(poll, /ensureBrandLoaded\([\s\S]*bustCache:\s*true/);
  assert.doesNotMatch(poll, /brandCache\[key\]\s*=/);
});

test("relative upload paths are accepted on save", () => {
  const f = sampleFeatureId();
  const result = validateFeatureEdit({
    ids: [f.id],
    image: "./data/uploads/camera-preview.png",
  });
  assert.equal(result.ok, true);
});

