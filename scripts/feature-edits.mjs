#!/usr/bin/env node
/**
 * Feature edit helpers: validate + apply in-memory overlays keyed by feature id.
 * Used by the local API (serve.mjs), app display path, and tests.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { CATEGORY_SOURCE_MANUAL } from "./manual-category-protection.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "..");
export const EDITS_PATH = join(ROOT, "data", "feature-edits.json");
export const UPLOADS_DIR = join(ROOT, "data", "uploads");
export const RELEASES_PATH = join(ROOT, "data", "releases.json");
export const RIVIAN_PATH = join(ROOT, "data", "rivian-releases.json");

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 6000;

export function loadJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadEditsDoc() {
  return (
    loadJson(EDITS_PATH, null) || {
      version: 1,
      description:
        "Manual feature field edits keyed by stable feature id.",
      edits: [],
    }
  );
}

export function saveEditsDoc(doc) {
  mkdirSync(dirname(EDITS_PATH), { recursive: true });
  writeFileSync(EDITS_PATH, JSON.stringify(doc, null, 2) + "\n");
}

export function loadCanonicalCategories(brand = "tesla") {
  const path = brand === "rivian" ? RIVIAN_PATH : RELEASES_PATH;
  const data = loadJson(path, null);
  if (!data?.categories?.length) {
    throw new Error(`Missing canonical categories in ${path}`);
  }
  return data.categories;
}

export function indexFeaturesById(brand = "tesla") {
  const path = brand === "rivian" ? RIVIAN_PATH : RELEASES_PATH;
  const data = loadJson(path, { features: [] });
  const byId = new Map();
  for (const f of data.features || []) {
    if (!f?.id) continue;
    if (!byId.has(f.id)) byId.set(f.id, []);
    byId.get(f.id).push(f);
  }
  return { data, byId };
}

/**
 * Validate a proposed edit payload.
 * @param {object} payload
 * @param {{ brand?: string, requireIdExists?: boolean }} opts
 */
export function validateFeatureEdit(payload, opts = {}) {
  const brand = opts.brand || "tesla";
  const errors = [];
  const warnings = [];

  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["Payload must be an object"], warnings };
  }

  const ids = Array.isArray(payload.ids)
    ? payload.ids.filter((id) => typeof id === "string" && id.trim())
    : payload.id
      ? [String(payload.id)]
      : [];

  if (!ids.length) {
    errors.push("At least one stable feature id is required");
  }

  const { byId } = indexFeaturesById(brand);
  const missingIds = ids.filter((id) => !byId.has(id));
  if (opts.requireIdExists !== false) {
    for (const id of missingIds) {
      errors.push(`Unknown feature id: ${id}`);
    }
  }

  let title = payload.title;
  if (title !== undefined) {
    if (typeof title !== "string") errors.push("title must be a string");
    else if (!title.trim()) errors.push("Feature name cannot be empty");
  }

  let description = payload.description;
  if (description !== undefined && typeof description !== "string") {
    errors.push("description must be a string");
  }

  let categories = payload.categories;
  if (categories !== undefined) {
    if (!Array.isArray(categories)) {
      errors.push("categories must be an array");
    } else if (!categories.length) {
      errors.push("At least one category tag is required");
    } else {
      const canonical = new Set(loadCanonicalCategories(brand));
      const seen = new Set();
      for (const c of categories) {
        if (typeof c !== "string") {
          errors.push("category tags must be strings");
          continue;
        }
        if (!canonical.has(c)) {
          errors.push(
            `Invalid category "${c}" — must match the canonical list exactly`
          );
        }
        if (seen.has(c)) {
          errors.push(`Duplicate category tag: ${c}`);
        }
        seen.add(c);
      }
    }
  }

  for (const field of ["image", "imageDark"]) {
    const v = payload[field];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string") {
      errors.push(`${field} must be a string URL or empty`);
      continue;
    }
    if (
      !/^https?:\/\//i.test(v) &&
      !v.startsWith("/data/uploads/") &&
      !v.startsWith("./data/uploads/") &&
      !v.startsWith("data:image/")
    ) {
      errors.push(
        `${field} must be an http(s) URL, /data/uploads/ path, or empty`
      );
    }
  }

  // Title collision warning across requested ids
  if (ids.length) {
    const titles = new Set();
    for (const id of ids) {
      const rows = byId.get(id) || [];
      if (rows[0]?.title) titles.add(rows[0].title);
    }
    if (titles.size > 1) {
      warnings.push(
        "Selected feature ids currently span multiple titles; edit will still apply per id"
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings, ids };
}

export function upsertEdits(payload, opts = {}) {
  const brand = opts.brand || "tesla";
  const validation = validateFeatureEdit(payload, { brand });
  if (!validation.ok) {
    return { ok: false, validation };
  }

  const doc = loadEditsDoc();
  const edits = Array.isArray(doc.edits) ? [...doc.edits] : [];
  const byId = new Map(edits.map((e, i) => [e.id, i]));
  const updatedAt = new Date().toISOString();
  const saved = [];

  for (const id of validation.ids) {
    const existingIdx = byId.has(id) ? byId.get(id) : -1;
    const prev = existingIdx >= 0 ? edits[existingIdx] : { id };
    const next = {
      ...prev,
      id,
      updatedAt,
    };
    if (payload.title !== undefined) next.title = String(payload.title).trim();
    if (payload.description !== undefined) {
      next.description = String(payload.description);
    }
    if (payload.categories !== undefined) {
      next.categories = [...payload.categories];
      // Persist explicit manual override so future automatic runs skip this id.
      next.categorySource = CATEGORY_SOURCE_MANUAL;
    }
    if (payload.image !== undefined) {
      next.image = payload.image === "" ? null : payload.image;
    }
    if (payload.imageDark !== undefined) {
      next.imageDark = payload.imageDark === "" ? null : payload.imageDark;
    }
    if (payload.note !== undefined) next.note = payload.note;

    if (existingIdx >= 0) edits[existingIdx] = next;
    else {
      byId.set(id, edits.length);
      edits.push(next);
    }
    saved.push(next);
  }

  const nextDoc = { ...doc, edits, updatedAt };
  if (!opts.dryRun) saveEditsDoc(nextDoc);
  return { ok: true, validation, edits: saved, doc: nextDoc };
}

/**
 * Apply feature edits in memory. category-overrides should already be applied
 * when present; feature-edits win for any overlapping fields.
 */
export function applyFeatureEdits(features, editsDoc) {
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
      description:
        e.description !== undefined ? e.description : f.description,
      image: e.image !== undefined ? e.image : f.image,
      imageDark: e.imageDark !== undefined ? e.imageDark : f.imageDark,
      categories: [...(categories || [])],
      primaryCategory: (categories && categories[0]) || f.primaryCategory,
      featureEdited: true,
      ...(hasManualCategories
        ? {
            categorySource: e.categorySource || CATEGORY_SOURCE_MANUAL,
            categoriesAuto: f.categoriesAuto || [...(f.categories || [])],
          }
        : {}),
    };
  });
}

export function extensionForMime(mime) {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  return null;
}

export function validateAndSaveUpload({
  filename,
  mime,
  buffer,
  maxBytes = MAX_IMAGE_BYTES,
}) {
  const errors = [];
  if (!ALLOWED_IMAGE_TYPES.has(mime)) {
    errors.push(`Unsupported file type: ${mime || "(none)"}`);
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    errors.push("Image data is empty");
  } else if (buffer.length > maxBytes) {
    errors.push(`Image exceeds ${Math.round(maxBytes / (1024 * 1024))}MB limit`);
  }

  // Light magic-byte checks
  if (Buffer.isBuffer(buffer) && buffer.length >= 4) {
    const isPng =
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isGif =
      buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
    const isWebp =
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP";
    const okMagic =
      (mime === "image/png" && isPng) ||
      (mime === "image/jpeg" && isJpg) ||
      (mime === "image/gif" && isGif) ||
      (mime === "image/webp" && isWebp);
    if (!okMagic) errors.push("File content does not match declared image type");
  }

  if (errors.length) return { ok: false, errors };

  const ext = extensionForMime(mime);
  const safeBase = String(filename || "image")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
  const outName = `${Date.now()}-${randomBytes(4).toString("hex")}-${safeBase}${
    safeBase.endsWith(ext) ? "" : ext
  }`;
  mkdirSync(UPLOADS_DIR, { recursive: true });
  const outPath = join(UPLOADS_DIR, outName);
  writeFileSync(outPath, buffer);
  return {
    ok: true,
    url: `./data/uploads/${outName}`,
    bytes: buffer.length,
    mime,
  };
}

export function readImageDimensionsHint(buffer, mime) {
  // Best-effort; not required for save. Used for optional validation messaging.
  try {
    if (mime === "image/png" && buffer.length >= 24) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }
    if (mime === "image/jpeg") {
      let i = 2;
      while (i < buffer.length - 8) {
        if (buffer[i] !== 0xff) break;
        const marker = buffer[i + 1];
        const len = buffer.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) {
          const height = buffer.readUInt16BE(i + 5);
          const width = buffer.readUInt16BE(i + 7);
          return { width, height };
        }
        i += 2 + len;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
