#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moveTagRelative,
  dropBeforeFromPoint,
  nearestChipFromPoint,
} from "./edit-tags.mjs";

test("drag first tag right places it after the neighbor (LTR)", () => {
  const next = moveTagRelative(
    ["Vehicle Control", "Profile"],
    "Vehicle Control",
    "Profile",
    false
  );
  assert.deepEqual(next, ["Profile", "Vehicle Control"]);
});

test("drag last tag left places it before the neighbor (RTL)", () => {
  const next = moveTagRelative(
    ["Vehicle Control", "Profile"],
    "Profile",
    "Vehicle Control",
    true
  );
  assert.deepEqual(next, ["Profile", "Vehicle Control"]);
});

test("any tag can move to either end of a longer list", () => {
  const tags = ["Vehicle Control", "Profile", "Lighting", "Audio"];
  assert.deepEqual(
    moveTagRelative(tags, "Audio", "Vehicle Control", true),
    ["Audio", "Vehicle Control", "Profile", "Lighting"]
  );
  assert.deepEqual(
    moveTagRelative(tags, "Vehicle Control", "Audio", false),
    ["Profile", "Lighting", "Audio", "Vehicle Control"]
  );
  assert.deepEqual(
    moveTagRelative(tags, "Profile", "Lighting", false),
    ["Vehicle Control", "Lighting", "Profile", "Audio"]
  );
});

test("drop side is left-of-midpoint before, otherwise after", () => {
  const rect = { left: 100, width: 40 };
  assert.equal(dropBeforeFromPoint(rect, 110), true);
  assert.equal(dropBeforeFromPoint(rect, 130), false);
});

test("nearest chip uses horizontal position so LTR and RTL both resolve", () => {
  const chips = [
    { cat: "Vehicle Control", left: 0, top: 0, width: 80, height: 24 },
    { cat: "Profile", left: 100, top: 0, width: 80, height: 24 },
  ];
  assert.equal(
    nearestChipFromPoint(chips, 140, 12, "Vehicle Control")?.cat,
    "Profile"
  );
  assert.equal(
    nearestChipFromPoint(chips, 20, 12, "Profile")?.cat,
    "Vehicle Control"
  );
});
