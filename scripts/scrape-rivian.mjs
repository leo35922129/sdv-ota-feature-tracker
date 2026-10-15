#!/usr/bin/env node
/**
 * Scrapes RivianTrackr + RivianWave software updates into data/rivian-releases.json
 * Matching features (same title + content) are merged; RivianWave images preferred.
 * Usage: node scripts/scrape-rivian.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scrapeRivianWave,
  mergeTrackrAndWave,
  parseRivianModels,
} from "./scrape-rivian-wave.mjs";
import {
  RIVIAN_CATEGORIES as CATEGORIES,
  categorizeRivian as categorize,
} from "./rivian-categories.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const OUT = join(DATA_DIR, "rivian-releases.json");
const CHECKPOINT = join(DATA_DIR, "rivian-checkpoint.json");
const BASE = "https://riviantrackr.com";
const HISTORY = `${BASE}/updates/`;
const CONCURRENCY = 3;
const DELAY_MS = 150;

const SKIP_TITLES = /^(how to use|how to personalize|leave a reply|notes?|important|overview)$/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pendingWithRefresh(items, isCached, refreshLatest) {
  const pending = [];
  const seen = new Set();
  const push = (item, key) => {
    if (seen.has(key)) return;
    seen.add(key);
    pending.push(item);
  };
  for (const item of items) {
    if (!isCached(item)) push(item, item.url);
  }
  for (const item of items.slice(0, refreshLatest)) {
    push(item, item.url);
  }
  return pending;
}

function writePayloadIfChanged(path, payload) {
  let prev = null;
  if (existsSync(path)) {
    try {
      prev = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      prev = null;
    }
  }
  const prevFeats = prev?.features || [];
  const nextFeats = payload.features || [];
  const same =
    prev &&
    prev.releaseCount === payload.releaseCount &&
    prev.featureCount === payload.featureCount &&
    prevFeats.length === nextFeats.length &&
    prevFeats.every(
      (f, i) =>
        f.id === nextFeats[i]?.id &&
        f.title === nextFeats[i]?.title &&
        f.description === nextFeats[i]?.description &&
        f.image === nextFeats[i]?.image
    );
  if (same && prev.scrapedAt) {
    payload.scrapedAt = prev.scrapedAt;
    payload.contentUnchanged = true;
  }
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return !same;
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

function extractLinks(html) {
  const links = [];
  const seen = new Set();
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = m[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) continue;
    if (href.startsWith("/")) href = `${BASE}${href}`;
    const title = stripTags(m[2]);
    if (!title || title.length < 2 || title.length > 80) continue;
    if (seen.has(href)) continue;
    // Skip nav / social / utility chrome
    if (
      /facebook|twitter|linkedin|instagram|reddit|threads|youtube\.com\/@|preferred source|leave a reply|cancel reply/i.test(
        href + " " + title
      )
    ) {
      continue;
    }
    seen.add(href);
    links.push({ title, url: href });
  }
  return links;
}

function formatDate(isoOrText) {
  if (!isoOrText) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(isoOrText)) {
    const d = new Date(`${isoOrText.slice(0, 10)}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  }
  return stripTags(isoOrText);
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

function listUpdates(html) {
  // Prefer table rows: version link + public release cell
  const updates = [];
  const seen = new Set();
  const rowRe =
    /<tr[^>]*>[\s\S]*?<a[^>]+href="(https:\/\/riviantrackr\.com\/(20\d{2}-[\d-]+)\/)"[^>]*>\s*([^<]+?)\s*<\/a>[\s\S]*?<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html))) {
    const url = m[1];
    const slug = m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    const cells = [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (c) => stripTags(c[1])
    );
    // Typical: [version..., first noticed, public release, available for]
    const versionLabel = stripTags(m[3]).split(/\s+/)[0];
    updates.push({
      url,
      slug,
      versionHint: versionLabel,
      publicReleaseHint: cells[2] && cells[2] !== "—" ? cells[2] : null,
      availableFor: cells[3] || null,
    });
  }

  // Fallback: any year-slug links
  if (updates.length === 0) {
    const linkRe =
      /href="(https:\/\/riviantrackr\.com\/(20\d{2}-[\d-]+)\/)"/g;
    while ((m = linkRe.exec(html))) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      updates.push({
        url: m[1],
        slug: m[2],
        versionHint: m[2].replace(/-/g, "."),
        publicReleaseHint: null,
        availableFor: null,
      });
    }
  }
  return updates;
}

function extractPanelContent(html) {
  const match = html.match(
    /<div class="rsu-panel__content">([\s\S]*?)<\/div>\s*<\/div>\s*(?:<\/div>)?/i
  );
  if (match) return match[1];
  const entry = html.match(
    /class="[^"]*entry-content[^"]*"[\s\S]*?>([\s\S]*?)<footer/i
  );
  return entry ? entry[1] : "";
}

function splitSections(contentHtml) {
  const parts = contentHtml.split(/<h3[^>]*>/i);
  const sections = [];
  for (let i = 1; i < parts.length; i++) {
    const endTitle = parts[i].indexOf("</h3>");
    if (endTitle === -1) continue;
    const title = stripTags(parts[i].slice(0, endTitle))
      .replace(/Gen \d Only/gi, "")
      .trim();
    const body = parts[i].slice(endTitle + 5);
    sections.push({ title, body });
  }
  return sections;
}

function topLevelListItems(html) {
  // Extract immediate <li> text from first top-level <ul>, flattening nested labels
  const ulMatch = html.match(/<ul>([\s\S]*)<\/ul>/i);
  if (!ulMatch) return [];
  const items = [];
  const re = /<li>([\s\S]*?)(?=<li>|<\/ul>)/gi;
  let m;
  const chunk = ulMatch[1];
  // Better: walk first-level lis only by tracking depth roughly
  let i = 0;
  while (i < html.length) {
    const liOpen = html.indexOf("<li>", i);
    if (liOpen === -1) break;
    // find matching close considering nested ul
    let depth = 1;
    let j = liOpen + 4;
    while (j < html.length && depth > 0) {
      const nextLi = html.indexOf("<li>", j);
      const nextClose = html.indexOf("</li>", j);
      const nextUl = html.indexOf("<ul>", j);
      const nextUlClose = html.indexOf("</ul>", j);
      const candidates = [
        ["li", nextLi],
        ["/li", nextClose],
        ["ul", nextUl],
        ["/ul", nextUlClose],
      ]
        .filter(([, idx]) => idx !== -1)
        .sort((a, b) => a[1] - b[1]);
      if (!candidates.length) break;
      const [kind, idx] = candidates[0];
      if (kind === "li" && depth === 1) {
        // root sibling started without close — shouldn't happen
      }
      if (kind === "li") depth += 0; // nested li inside ul already counted via ul
      if (kind === "ul") depth += 1;
      if (kind === "/ul") depth -= 1;
      if (kind === "/li") {
        if (depth === 1) {
          const raw = html.slice(liOpen + 4, idx);
          // Prefer first-line title before nested ul
          const beforeNested = raw.split(/<ul/i)[0];
          const title = stripTags(beforeNested).replace(/Gen \d Only/gi, "").trim();
          const desc = stripTags(raw).replace(/Gen \d Only/gi, "").trim();
          if (title) items.push({ title: title.slice(0, 120), description: desc });
          i = idx + 5;
          depth = 0;
          break;
        }
        depth -= 1;
      }
      j = idx + (kind.startsWith("/") ? 5 : 4);
    }
    if (depth !== 0) break;
  }
  return items;
}

function parseReleasePage(meta, html) {
  const version =
    (html.match(/data-rsu-version="([^"]+)"/) || [])[1] ||
    meta.versionHint ||
    meta.slug.replace(/-/g, ".");

  const releaseIso =
    (html.match(
      /rsu-date--released[\s\S]{0,200}?<time[^>]*datetime="([^"]+)"/i
    ) || [])[1] || null;
  const noticedIso =
    (html.match(
      /rsu-date--noticed[\s\S]{0,200}?<time[^>]*datetime="([^"]+)"/i
    ) || [])[1] || null;

  const releaseDate =
    formatDate(releaseIso) ||
    meta.publicReleaseHint ||
    formatDate(noticedIso);

  const image =
    (html.match(/property="og:image"\s+content="([^"]+)"/i) || [])[1] || null;

  const availableFor =
    stripTags(
      (html.match(
        /rsu-date__vehicle">([\s\S]*?)<\/span>/i
      ) || [])[1] || ""
    ) || meta.availableFor;

  const content = extractPanelContent(html);
  const sections = splitSections(content);
  const features = [];

  for (const section of sections) {
    if (SKIP_TITLES.test(section.title)) continue;

    if (/^additional improvements$/i.test(section.title)) {
      const items = topLevelListItems(section.body);
      if (items.length) {
        for (const [idx, item] of items.entries()) {
          const categories = categorize(item.title, item.description);
          features.push({
            id: `${version}-improvement-${idx}`,
            title: item.title,
            type: "improvement",
            description: item.description,
            image,
            imageDark: null,
            links: [],
            categories,
            primaryCategory: categories[0],
          });
        }
        continue;
      }
    }

    const description = stripTags(section.body);
    if (!description && !section.title) continue;
    const categories = categorize(section.title, description);
    features.push({
      id: `${version}-${section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      title: section.title,
      type: "official",
      description,
      image,
      imageDark: null,
      links: extractLinks(section.body),
      categories,
      primaryCategory: categories[0],
    });
  }

  // Fallback if no h3 sections
  if (features.length === 0) {
    const description = stripTags(content).slice(0, 1200);
    const title = `Update ${version}`;
    const categories = categorize(title, description);
    features.push({
      id: `${version}-overview`,
      title,
      type: "overview",
      description,
      image,
      imageDark: null,
      links: extractLinks(content),
      categories,
      primaryCategory: categories[0],
    });
  }

  return {
    version,
    url: meta.url,
    releaseDate,
    availableFor,
    image,
    features,
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

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log("Fetching Rivian updates index…");
  const historyHtml = await fetchText(HISTORY);
  const updates = listUpdates(historyHtml);
  console.log(`Found ${updates.length} Rivian OTA pages`);

  let done = {};
  if (existsSync(CHECKPOINT)) {
    try {
      done = JSON.parse(readFileSync(CHECKPOINT, "utf8"));
      console.log(`Resuming with ${Object.keys(done).length} cached pages`);
    } catch {
      done = {};
    }
  }

  const refreshLatest = Math.max(
    0,
    Number.parseInt(process.env.REFRESH_LATEST || "0", 10) || 0
  );
  const pending = pendingWithRefresh(
    updates,
    (u) => Boolean(done[u.url]),
    refreshLatest
  );
  console.log(
    `Fetching ${pending.length} release-note pages${refreshLatest ? ` (refresh latest ${refreshLatest})` : ""}…`
  );

  let completed = 0;
  await mapPool(pending, CONCURRENCY, async (meta) => {
    try {
      await sleep(DELAY_MS);
      const html = await fetchText(meta.url);
      done[meta.url] = parseReleasePage(meta, html);
      completed++;
      if (completed % 10 === 0 || completed === pending.length) {
        writeFileSync(CHECKPOINT, JSON.stringify(done));
        console.log(`  ${completed}/${pending.length} scraped`);
      }
    } catch (err) {
      console.error(`  Failed ${meta.url}: ${err.message}`);
      done[meta.url] = {
        version: meta.versionHint,
        url: meta.url,
        releaseDate: meta.publicReleaseHint,
        availableFor: meta.availableFor,
        image: null,
        features: [],
        error: err.message,
      };
    }
  });

  const releases = updates.map((u) => done[u.url]).filter(Boolean);
  const trackrFeatures = releases.flatMap((r) => {
    const releaseModels = parseRivianModels(r.availableFor);
    return r.features.map((f) => ({
      ...f,
      image: f.image && !/riviantrackr\.com|FeaturedOTA|Master-Banner|og-image|placeholder|update-display/i.test(f.image)
        ? f.image
        : null,
      models: f.models?.length ? f.models : releaseModels,
      version: r.version,
      releaseDate: r.releaseDate,
      releaseUrl: r.url,
    }));
  });

  console.log("Scraping RivianWave as secondary source…");
  const wave = await scrapeRivianWave();
  let allFeatures = mergeTrackrAndWave(trackrFeatures, wave.features);

  // Ensure categories on Wave-only rows
  for (const f of allFeatures) {
    if (!f.categories?.length) {
      f.categories = categorize(f.title, f.description);
      f.primaryCategory = f.categories[0];
    }
  }

  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const f of allFeatures) {
    for (const c of f.categories) {
      if (categoryCounts[c] != null) categoryCounts[c]++;
    }
  }

  const withWaveImage = allFeatures.filter(
    (f) => f.image && /rivianwave\.com/i.test(f.image)
  ).length;
  const mergedBoth = allFeatures.filter((f) =>
    (f.sources || []).includes("riviantrackr") &&
    (f.sources || []).includes("rivianwave")
  ).length;

  const payload = {
    brand: "rivian",
    source: HISTORY,
    sources: [HISTORY, "https://www.rivianwave.com/software-updates/"],
    waveVersions: wave.updates.map((u) => u.version),
    scrapedAt: new Date().toISOString(),
    categories: CATEGORIES,
    categoryCounts,
    releaseCount: releases.length,
    featureCount: allFeatures.length,
    mergeStats: {
      trackrFeatures: trackrFeatures.length,
      waveFeatures: wave.features.length,
      mergedBoth,
      withWaveImage,
    },
    releases,
    features: allFeatures,
  };

  writePayloadIfChanged(OUT, payload);
  writeFileSync(CHECKPOINT, JSON.stringify(done));
  console.log(
    `Wrote ${OUT} — ${releases.length} releases, ${allFeatures.length} features (${mergedBoth} merged with Wave, ${withWaveImage} Wave images)${
      payload.contentUnchanged ? " (unchanged)" : ""
    }`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
