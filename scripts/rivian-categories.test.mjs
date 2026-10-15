#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { categorizeRivian } from "./rivian-categories.mjs";

const AUTO = "Drive Assist & Autonomy";

test("Highway Assist and Driver+ are Drive Assist & Autonomy", () => {
  const hwa = categorizeRivian(
    "Improved Highway Assist lane centering",
    "Highway Assist stays centered in lane."
  );
  assert.equal(hwa[0], AUTO);

  const plus = categorizeRivian(
    "Driver+ Settings Are Now Persistent",
    "Driver+ settings persist across drives."
  );
  assert.equal(plus[0], AUTO);
});

test("driver profile features stay in User Profile", () => {
  const profile = categorizeRivian(
    "Driver Profile Enhancements",
    "Your driver profile also saves your media, climate, driver assistance, and units of measurement settings."
  );
  assert.equal(profile[0], "User Profile");

  const glove = categorizeRivian(
    "Dual glove boxes",
    "Dedicated space for the driver and front passenger."
  );
  assert.ok(!glove.includes(AUTO));

  const display = categorizeRivian(
    "Driver Display Improvements",
    "We improved the appearance of the driver display."
  );
  assert.ok(!display.includes(AUTO));
});

test("Autonomy View is Drive Assist & Autonomy", () => {
  const view = categorizeRivian(
    "Autonomy View Enhancements",
    "Traffic lights are now shown in the Autonomy view on the driver display."
  );
  assert.equal(view[0], "Drive Assist & Autonomy");
});

test("Bluetooth hands-free calls are not Drive Assist", () => {
  const call = categorizeRivian(
    "Improved Bluetooth hands-free audio stability",
    "Fixed a rare issue that caused Bluetooth audio to glitch after a hands-free phone call ended."
  );
  assert.ok(!call.includes(AUTO));
  assert.ok(call.includes("Audio"));
  assert.ok(call.includes("Connectivity"));
});

test("audio and sound features are tagged Audio", () => {
  const tuning = categorizeRivian(
    "Audio",
    "New audio tuning with improved audio dynamics, tonal balance, and more immersiveness with Dolby Atmos content."
  );
  assert.ok(tuning.includes("Audio"));
  assert.equal(tuning[0], "Audio");

  const lock = categorizeRivian(
    "New lock sound for the day or night",
    "You now have the option to set the exterior lock sound to a bluebird chirp or an owl hoot."
  );
  assert.ok(lock.includes("Audio"));

  const music = categorizeRivian(
    "Apple Music now available in the Media app",
    "Apple Music is now available in your vehicle."
  );
  assert.ok(music.includes("Audio"));
});

test("Go Chime stays Drive Assist primary and also gets Audio", () => {
  const chime = categorizeRivian(
    "New Driver Assistance feature: Go Chime",
    "Go Chime now provides a chime only when Driver Attention Detection confirms the driver is not looking at the road."
  );
  assert.equal(chime[0], AUTO);
  assert.ok(chime.includes("Audio"));
});

test("sound the alarm on Apple Watch is not Audio", () => {
  const alarm = categorizeRivian(
    "Apple Watch app",
    "You can also use the Apple Watch app to lock or unlock your doors, vent your windows, or sound the alarm."
  );
  assert.ok(!alarm.includes("Audio"));
  assert.ok(alarm.includes("Mobile & Watch App"));
});

test("bluetooth, wifi, and cellular features are tagged Connectivity", () => {
  const wifi = categorizeRivian(
    "WiFi Hotspot",
    "Use your vehicle as a Wi-Fi hotspot for passengers and devices."
  );
  assert.ok(wifi.includes("Connectivity"));
  assert.equal(wifi[0], "Connectivity");

  const cellular = categorizeRivian(
    "Improved overall connectivity robustness, including recovering after extended loss of cellular service.",
    "Improved overall connectivity robustness, including recovering after extended loss of cellular service."
  );
  assert.ok(cellular.includes("Connectivity"));

  const music = categorizeRivian(
    "Apple Music now available in the Media app",
    "Apple Music is now available in your vehicle."
  );
  assert.ok(!music.includes("Connectivity"));
});

test("missed Autonomy features are tagged Drive Assist", () => {
  const lka = categorizeRivian(
    "Smoother Lane Keeping Assist intervention.",
    "Smoother Lane Keeping Assist intervention."
  );
  assert.equal(lka[0], AUTO);

  const uhf = categorizeRivian(
    "Fixed an issue that caused Universal Hands-Free to not automatically re-engage after a manual lane change.",
    "Fixed an issue that caused Universal Hands-Free to not automatically re-engage after a manual lane change."
  );
  assert.equal(uhf[0], AUTO);
});
