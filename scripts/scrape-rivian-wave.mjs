#!/usr/bin/env node
/**
 * Scrapes RivianWave software updates into data/rivian-wave-checkpoint.json
 * Usage: node scripts/scrape-rivian-wave.mjs
 * Also exported for merge from scrape-rivian.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const CHECKPOINT = join(DATA_DIR, "rivian-wave-checkpoint.json");
const BASE = "https://www.rivianwave.com";
const INDEX = `${BASE}/software-updates/`;
const HISTORY = `${BASE}/software-updates/history/`;
const CONCURRENCY = 3;
const DELAY_MS = 120;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function absUrl(href) {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `${BASE}${href}`;
  return `${BASE}/${href}`;
}

function isPlaceholderImage(url) {
  if (!url) return true;
  if (/placeholder|rivian-wave-placeholder|default[-_]social|og[-_]image/i.test(url)) {
    return true;
  }
  // Release posters / site banners are not feature screenshots
  if (/riviantrackr\.com/i.test(url)) return true;
  if (/FeaturedOTA|Master-Banner/i.test(url)) return true;
  return false;
}

async function fetchText(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CompetitiveSDVOTATracker/1.0; +local research)",
          Accept: "text/html",
        },
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(800 * (i + 1));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

export function listWaveVersions(html) {
  const versions = [];
  const seen = new Set();
  const re = /\/software-updates\/version\/([^"\/]+)\/release-notes/g;
  let m;
  while ((m = re.exec(html))) {
    const version = decodeURIComponent(m[1]);
    if (seen.has(version)) continue;
    seen.add(version);
    versions.push({
      version,
      url: `${BASE}/software-updates/version/${version}/release-notes`,
    });
  }
  return versions;
}

async function collectWaveIndex() {
  const pages = [INDEX, HISTORY];
  for (let page = 2; page <= 8; page++) {
    pages.push(`${INDEX}?page=${page}`);
  }
  const seen = new Set();
  const updates = [];
  for (const url of pages) {
    let html;
    try {
      html = await fetchText(url);
    } catch {
      continue;
    }
    for (const item of listWaveVersions(html)) {
      if (seen.has(item.version)) continue;
      seen.add(item.version);
      updates.push(item);
    }
  }
  return updates;
}

function extractDescription(blockHtml) {
  const match = blockHtml.match(
    /class="[^"]*mod-update-feature-description[^"]*"[^>]*>([\s\S]*?)(?:<\/div>\s*<\/div>\s*<\/div>|$)/i
  );
  if (!match) return "";
  // Stop at nested structural closers by taking until last reasonable chunk
  let raw = match[1];
  const cut = raw.search(/<\/section>/i);
  if (cut !== -1) raw = raw.slice(0, cut);
  return stripTags(raw);
}

function listItemsFromDescription(html) {
  const items = [];
  const ulChunks = [...html.matchAll(/<ul>([\s\S]*?)<\/ul>/gi)].map((m) => m[1]);
  for (const chunk of ulChunks) {
    const lis = [...chunk.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    for (const li of lis) {
      const text = stripTags(li[1]);
      if (!text || text.length < 12) continue;
      const title = text.length > 90 ? `${text.slice(0, 87)}…` : text;
      items.push({ title, description: text });
    }
  }
  return items;
}

export function parseRivianModels(text) {
  if (!text) return [];
  const found = [];
  for (const m of ["R1T", "R1S", "R2", "EDV"]) {
    if (new RegExp(`\\b${m}\\b`, "i").test(String(text))) found.push(m);
  }
  return found;
}

function extractWaveModels(blockHtml) {
  const models = [];
  const seen = new Set();
  const dataModels = blockHtml.match(/data-models='(\{[^']+\})'/i);
  if (dataModels) {
    try {
      const parsed = JSON.parse(dataModels[1]);
      for (const raw of parsed.models || []) {
        const m = String(raw).toUpperCase();
        if (!/^(R1T|R1S|R2|EDV)$/.test(m) || seen.has(m)) continue;
        seen.add(m);
        models.push(m);
      }
    } catch {
      /* ignore */
    }
  }
  const modelRe =
    /requirement-name-model(?!-label)[^>]*>([\s\S]*?)<\/div>/gi;
  let mm;
  while ((mm = modelRe.exec(blockHtml))) {
    for (const m of parseRivianModels(stripTags(mm[1]))) {
      if (seen.has(m)) continue;
      seen.add(m);
      models.push(m);
    }
  }
  return models;
}

function parseWaveReleasePage(meta, html) {
  const releaseDateMatch =
    html.match(/Release Date\s*<\/[^>]+>\s*([^<]+)/i) ||
    html.match(/Release Date[^A-Za-z0-9]{0,40}([A-Za-z]+ \d{1,2}, \d{4})/i);
  const releaseDate = releaseDateMatch
    ? stripTags(releaseDateMatch[1]).trim()
    : null;

  const sections = [
    ...html.matchAll(/<section class="mod-update-feature"[^>]*>([\s\S]*?)<\/section>/gi),
  ];
  const features = [];

  for (const [idx, sec] of sections.entries()) {
    const attrs = sec[0].slice(0, sec[0].indexOf(">"));
    const type = (attrs.match(/data-feature-type="([^"]+)"/) || [])[1] || "official";
    const block = sec[1];
    const title = stripTags((block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || "");
    if (!title) continue;

    const imgRaw = (block.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || null;
    const image = isPlaceholderImage(imgRaw) ? null : absUrl(imgRaw);

    const descHtmlMatch = block.match(
      /class="[^"]*mod-update-feature-description[^"]*"[^>]*>([\s\S]*)/i
    );
    const descHtml = descHtmlMatch ? descHtmlMatch[1] : "";
    const description = stripTags(descHtml);
    const models = extractWaveModels(block);

    if (/^additional improvements$/i.test(title)) {
      const items = listItemsFromDescription(descHtml);
      if (items.length) {
        for (const [j, item] of items.entries()) {
          features.push({
            id: `${meta.version}-wave-improvement-${j}`,
            title: item.title,
            type: "improvement",
            description: item.description,
            image: null,
            imageDark: null,
            links: [],
            models: [...models],
            source: "rivianwave",
            waveUrl: meta.url,
          });
        }
        continue;
      }
    }

    features.push({
      id: `${meta.version}-wave-${idx}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      title,
      type,
      description,
      image,
      imageDark: null,
      links: [],
      models,
      source: "rivianwave",
      waveUrl: meta.url,
    });
  }

  return {
    version: meta.version,
    url: meta.url,
    releaseDate,
    image: null,
    features,
    source: "rivianwave",
  };
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

export async function scrapeRivianWave({ quiet = false } = {}) {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!quiet) console.log("Fetching RivianWave updates index…");
  const updates = await collectWaveIndex();
  if (!quiet) console.log(`Found ${updates.length} RivianWave OTA pages`);

  let done = {};
  if (existsSync(CHECKPOINT)) {
    try {
      done = JSON.parse(readFileSync(CHECKPOINT, "utf8"));
      if (!quiet) console.log(`Resuming Wave with ${Object.keys(done).length} cached pages`);
    } catch {
      done = {};
    }
  }

  const pending = updates.filter((u) => !done[u.url]);
  if (!quiet) console.log(`Fetching ${pending.length} RivianWave release-note pages…`);

  let completed = 0;
  await mapPool(pending, CONCURRENCY, async (meta) => {
    try {
      await sleep(DELAY_MS);
      const html = await fetchText(meta.url);
      done[meta.url] = parseWaveReleasePage(meta, html);
      completed++;
      if (!quiet && (completed % 5 === 0 || completed === pending.length)) {
        writeFileSync(CHECKPOINT, JSON.stringify(done));
        console.log(`  Wave ${completed}/${pending.length} scraped`);
      }
    } catch (err) {
      console.error(`  Failed Wave ${meta.url}: ${err.message}`);
      done[meta.url] = {
        version: meta.version,
        url: meta.url,
        releaseDate: null,
        image: null,
        features: [],
        error: err.message,
        source: "rivianwave",
      };
    }
  });

  writeFileSync(CHECKPOINT, JSON.stringify(done));
  const releases = updates.map((u) => done[u.url]).filter(Boolean);
  const features = releases.flatMap((r) =>
    (r.features || []).map((f) => ({
      ...f,
      version: r.version,
      releaseDate: r.releaseDate,
      releaseUrl: r.url,
    }))
  );

  return { updates, releases, features, checkpoint: done };
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[^\w\s.+/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textsMatch(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Near-duplicate: one description embeds the other
  if (na.length >= 40 && nb.length >= 40) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  return false;
}

function preferImage(trackrImage, waveImage) {
  if (waveImage && !isPlaceholderImage(waveImage)) return waveImage;
  if (trackrImage && !isPlaceholderImage(trackrImage)) return trackrImage;
  return null;
}

/**
 * Merge Trackr features with RivianWave features.
 * Same title + content within a version → combine; prefer Wave images.
 */
export function mergeTrackrAndWave(trackrFeatures, waveFeatures) {
  const waveByVersion = new Map();
  for (const f of waveFeatures) {
    const key = f.version;
    if (!waveByVersion.has(key)) waveByVersion.set(key, []);
    waveByVersion.get(key).push({ ...f, _used: false });
  }

  // Also index by major.minor when exact version differs (2026.24.40 vs 2026.24)
  function waveCandidates(version) {
    const exact = waveByVersion.get(version) || [];
    const major = String(version).split(".").slice(0, 2).join(".");
    const related = [];
    for (const [v, list] of waveByVersion) {
      if (v === version) continue;
      if (v === major || String(v).startsWith(`${major}.`) || String(version).startsWith(`${v}.`)) {
        related.push(...list);
      }
    }
    return [...exact, ...related];
  }

  const merged = [];
  for (const tf of trackrFeatures) {
    const candidates = waveCandidates(tf.version);
    let match = candidates.find(
      (w) =>
        !w._used &&
        textsMatch(w.title, tf.title) &&
        textsMatch(w.description, tf.description)
    );
    if (!match) {
      // Title-only match when descriptions clearly overlap
      match = candidates.find(
        (w) =>
          !w._used &&
          textsMatch(w.title, tf.title) &&
          (textsMatch(w.description, tf.description) ||
            normalizeText(w.description).includes(normalizeText(tf.description).slice(0, 80)) ||
            normalizeText(tf.description).includes(normalizeText(w.description).slice(0, 80)))
      );
    }

    if (match) {
      match._used = true;
      const models = [
        ...new Set([...(tf.models || []), ...(match.models || [])]),
      ];
      merged.push({
        ...tf,
        image: preferImage(tf.image, match.image),
        imageDark: tf.imageDark || match.imageDark || null,
        models,
        sources: ["riviantrackr", "rivianwave"],
        waveUrl: match.waveUrl || null,
      });
    } else {
      merged.push({
        ...tf,
        models: tf.models || [],
        sources: ["riviantrackr"],
        waveUrl: null,
      });
    }
  }

  // Wave-only features (not already merged)
  for (const list of waveByVersion.values()) {
    for (const w of list) {
      if (w._used) continue;
      merged.push({
        id: w.id,
        title: w.title,
        type: w.type || "official",
        description: w.description,
        image: preferImage(null, w.image),
        imageDark: null,
        links: [],
        models: w.models || [],
        categories: w.categories || ["Vehicle OS"],
        primaryCategory: w.primaryCategory || "Vehicle OS",
        version: w.version,
        releaseDate: w.releaseDate,
        releaseUrl: w.releaseUrl || w.waveUrl,
        sources: ["rivianwave"],
        waveUrl: w.waveUrl || null,
      });
    }
  }

  return merged;
}

async function main() {
  const { releases, features } = await scrapeRivianWave();
  console.log(
    `RivianWave scrape complete — ${releases.length} releases, ${features.length} features`
  );
}

const isDirect =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
