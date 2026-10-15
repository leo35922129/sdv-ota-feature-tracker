#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  featureMatchesSearch,
  titleMatchRank,
  rankSearchResults,
  highlightSearchHtml,
} from "./search-results.mjs";

test("title matches rank ahead of description-only matches", () => {
  const groups = [
    { title: "Climate Controls", description: "Seat heating in the app" },
    { title: "Seat Heater", description: "Warm the cabin seats" },
    { title: "Dog Mode", description: "Keep pets safe" },
  ];
  const ranked = rankSearchResults(groups, "seat");
  assert.equal(ranked[0].title, "Seat Heater");
  assert.equal(ranked[1].title, "Climate Controls");
  assert.equal(ranked.length, 2);
});

test("feature name equality ranks above a title that merely contains the query", () => {
  const groups = [
    { title: "Tesla App FSD", description: "" },
    { title: "FSD", description: "" },
    { title: "Autopilot", description: "Includes FSD visualization" },
  ];
  const ranked = rankSearchResults(groups, "FSD");
  assert.equal(ranked[0].title, "FSD");
  assert.equal(ranked[1].title, "Tesla App FSD");
  assert.equal(ranked[2].title, "Autopilot");
});

test("all keywords must match, not only the first token", () => {
  assert.equal(
    featureMatchesSearch(
      { title: "Driver Profile", description: "Saved seats" },
      "driver profile"
    ),
    true
  );
  assert.equal(
    featureMatchesSearch(
      { title: "Driver Profile", description: "Saved seats" },
      "driver charging"
    ),
    false
  );
});

test("titleMatchRank treats names that contain every keyword as title hits", () => {
  assert.equal(titleMatchRank("Driver Profiles", "driver profile"), 1);
  assert.equal(titleMatchRank("Automatic Driver Profiles", "driver profile"), 2);
  assert.equal(titleMatchRank("Range Display", "driver profile"), 3);
});

test("highlight wraps keywords without breaking HTML escaping", () => {
  const html = highlightSearchHtml("FSD (Supervised) & Autopilot", "FSD");
  assert.match(html, /<mark class="search-hit">FSD<\/mark>/);
  assert.match(html, /&amp;/);
  assert.doesNotMatch(html, /<mark class="search-hit">&/);
});
