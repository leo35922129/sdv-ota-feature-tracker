#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isManualCategoryLock,
  inheritManualCategoriesByFeatureKey,
  inheritEditedImagesByFeatureKey,
  mergeGroupCategories,
  protectedIdentityKeys,
  featureIdentityKey,
} from "./manual-category-lock.mjs";

test("manual category source is treated as a lock", () => {
  assert.equal(isManualCategoryLock({ categorySource: "manual_override" }), true);
  assert.equal(isManualCategoryLock({ categorySource: "override" }), true);
  assert.equal(isManualCategoryLock({ categorySource: "automatic" }), false);
});

test("grouping does not union automatic tags onto a locked card", () => {
  const group = {
    categories: ["Lighting"],
    categorySource: "manual_override",
    categoriesLocked: true,
  };
  mergeGroupCategories(group, {
    categories: ["Lighting", "Vehicle OS", "Camera"],
    categorySource: "automatic",
  });
  assert.deepEqual(group.categories, ["Lighting"]);
});

test("a later manual tag lock replaces unlocked automatic group tags", () => {
  const group = { categories: ["Vehicle OS", "Camera"] };
  mergeGroupCategories(group, {
    categories: ["Autopilot / Full Self-Driving"],
    categorySource: "manual_override",
  });
  assert.deepEqual(group.categories, ["Autopilot / Full Self-Driving"]);
  assert.equal(group.categoriesLocked, true);
});

test("new OTA copies inherit saved tags for the same feature name and description", () => {
  const features = inheritManualCategoriesByFeatureKey([
    {
      id: "edited",
      title: "Tesla App FSD",
      description: "Start FSD from the app.",
      categories: ["Mobile App", "Autopilot / Full Self-Driving"],
      categorySource: "manual_override",
    },
    {
      id: "new-ota",
      title: "Tesla App FSD",
      description: "Start FSD from the app.",
      categories: ["FSD", "Mobile App", "Camera"],
      categorySource: "automatic",
    },
  ]);
  assert.deepEqual(features[1].categories, [
    "Mobile App",
    "Autopilot / Full Self-Driving",
  ]);
  assert.equal(features[1].categoriesInherited, true);
  assert.equal(features[1].categorySource, "manual_override");
});

test("different feature descriptions do not inherit another card's tags", () => {
  const features = inheritManualCategoriesByFeatureKey([
    {
      id: "a",
      title: "UI Improvements",
      description: "Climate icons",
      categories: ["UI / Visualization"],
      categorySource: "manual_override",
    },
    {
      id: "b",
      title: "UI Improvements",
      description: "New fonts",
      categories: ["Vehicle OS"],
      categorySource: "automatic",
    },
  ]);
  assert.deepEqual(features[1].categories, ["Vehicle OS"]);
  assert.equal(features[1].categoriesInherited, undefined);
});

test("protected identity keys follow title + description", () => {
  const features = [
    { id: "one", title: "Seat Heater", description: "Warm seats" },
    { id: "two", title: "Other", description: "x" },
  ];
  const keys = protectedIdentityKeys(features, new Set(["one"]));
  assert.equal(keys.has(featureIdentityKey(features[0])), true);
  assert.equal(keys.has(featureIdentityKey(features[1])), false);
});

test("new OTA copies inherit a saved image upload for the same feature", () => {
  const features = inheritEditedImagesByFeatureKey([
    {
      id: "edited",
      title: "Camera Preview",
      description: "Open cameras while driving.",
      image: "/data/uploads/camera-preview.png",
      imageDark: "https://example.com/dark.png",
      featureEdited: true,
    },
    {
      id: "new-ota",
      title: "Camera Preview",
      description: "Open cameras while driving.",
      image: "https://example.com/source.png",
      imageDark: "https://example.com/source-dark.png",
    },
  ]);
  assert.equal(features[1].image, "/data/uploads/camera-preview.png");
  assert.equal(features[1].imageDark, "https://example.com/dark.png");
  assert.equal(features[1].imageInherited, true);
  assert.equal(features[0].imageInherited, undefined);
});

test("different feature descriptions do not inherit another card's image", () => {
  const features = inheritEditedImagesByFeatureKey([
    {
      id: "a",
      title: "Camera Preview",
      description: "While driving.",
      image: "/data/uploads/a.png",
      featureEdited: true,
    },
    {
      id: "b",
      title: "Camera Preview",
      description: "Park only.",
      image: "https://example.com/b.png",
    },
  ]);
  assert.equal(features[1].image, "https://example.com/b.png");
  assert.equal(features[1].imageInherited, undefined);
});
