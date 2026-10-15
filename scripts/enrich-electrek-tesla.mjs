#!/usr/bin/env node
/**
 * Enrich Electrek historical Tesla features (2012–2016) with researched
 * definitions and card-ready images (NotaTeslaApp screenshot aspect + Wikimedia).
 *
 * Usage: node scripts/enrich-electrek-tesla.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "data", "releases.json");
const CACHE = join(ROOT, "data", "electrek-tesla-features.json");

const N = "https://www.notateslaapp.com/images/tesla-car-updates";
const WIKI_INTERIOR =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/The_interior_of_Tesla_Model_S.jpg/960px-The_interior_of_Tesla_Model_S.jpg";
const WIKI_INTERIOR_2 =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Tesla_Model_S_Interior.jpg/1280px-Tesla_Model_S_Interior.jpg";

/**
 * Keyed by normalized title (lowercase, collapsed whitespace).
 * Descriptions synthesize Tesla release notes, contemporary coverage
 * (Electrek, Green Car Reports, Wired, Tesla software archive), and owner's-manual definitions.
 */
const ENRICHMENT = {
  "projected and rated range": {
    description:
      "Shows both projected range (based on recent driving efficiency) and rated range (EPA/WLTP estimate) so drivers can compare real-world consumption against the official rating on the instrument cluster and energy displays.",
    image: `${N}/2021.40/2021.40-Range-Display.png`,
    categories: ["UI / Visualization", "Map / Navigation / Trip / Route"],
  },
  "entry / exit feature – displays on and media auto play for entry and decrease volume upon exit": {
    description:
      "Automatically wakes the displays and can resume media when you enter the car, then lowers media volume when you exit—an early welcome/leave behavior for the Model S cabin experience.",
    image: `${N}/2026.26/welcome-animation.png`,
    categories: ["Audio"],
  },
  "driver profiles (up to 10 can be saved)": {
    description:
      "Saves personalized seat, mirror, steering, and preference settings under named driver profiles. Early Model S software allowed up to 10 profiles so multiple drivers could restore their setup quickly.",
    image: `${N}/2022.24/2022.24-Driver_Profiles.png`,
    categories: ["Profile"],
  },
  "creep mode (emulate automatic transmission idle forward)": {
    description:
      "Optional creep that gently rolls the car forward when Drive is selected and the brake is released, mimicking a conventional automatic transmission at idle for low-speed parking-lot feel.",
    image: `${N}/2023.12/2023.12.9-Stopping-Mode.png`,
    categories: ["Vehicle Control"],
  },
  "traffic lines in map": {
    description:
      "Adds live traffic flow coloring on the navigation map so congested roads stand out while routing—an early traffic visualization layer on the Model S touchscreen map.",
    image: `${N}/2025.8/traffic.jpg`,
    categories: ["Map / Navigation / Trip / Route"],
  },
  "higher volume granularity": {
    description:
      "Increases the number of discrete volume steps on the media system (beyond the earlier coarse 1–11 scale) so drivers can fine-tune cabin audio more precisely.",
    image:
      "https://www.notateslaapp.com/img/containers/article_images/2026/volume-icon.webp/c34d1fa61db7885c689603a0ba70b55d/volume-icon.jpg",
    categories: ["Audio"],
  },
  "lock and unlock touch screen buttons separated for ease of use": {
    description:
      "Splits lock and unlock into separate on-screen controls instead of a single combined control, making it harder to tap the wrong action on the center display.",
    image: `${N}/2024.14/2024.14-new-lock-sounds.png`,
    categories: ["UI / Visualization", "Vehicle Control"],
  },
  "mobile app remote access": {
    description:
      "Enables remote vehicle status and basic controls from the Tesla smartphone app (lock/unlock, climate, charging, and location), extending the cabin UI with phone-side access over the cellular connection.",
    image: `${N}/2023.44.25/trip-planner-2.png`,
    categories: ["Mobile App"],
  },
  "cancel button to nav": {
    description:
      "Adds an explicit cancel control to end an active navigation route from the map UI without digging through menus.",
    image: `${N}/2026.26/preferred-routes.png`,
    categories: ["Map / Navigation / Trip / Route"],
  },
  "vehicle sleep mode (reduced vampire drain)": {
    description:
      "Powers down the displays and non-essential electronics when parked to cut vampire drain. Tesla noted that leaving systems awake could cost on the order of ~8 miles of range per day when unplugged.",
    image:
      "https://www.notateslaapp.com/img/containers/article_images/2024/eu_actually_smart_summon.jpg/9734acf94909828d4a6914d54813a5da/eu_actually_smart_summon.jpg",
    categories: ["Vehicle OS", "Scenario / Mode"],
  },
  "app launcher": {
    description:
      "Introduces an app launcher so owners can open cabin apps and choose whether they appear in the upper or lower half of the 17\" touchscreen via drag-and-drop placement.",
    image: `${N}/2021.44/2021.44.25-Customizable_App_Launcher.png`,
    categories: ["UI / Visualization"],
  },
  "voice commands": {
    description:
      "Hands-free voice control via the steering-wheel button for navigation (“drive to”), phone calls (“call”), and streaming audio (“listen” / play artist radio), using cloud speech recognition over the car’s modem.",
    image: `${N}/2025.26/2025.26-voice-commands.png`,
    categories: ["Voice & AI"],
  },
  "auto present door handles": {
    description:
      "Automatically presents the flush door handles when you approach with a paired key fob, so you no longer need to press the handle to deploy it before opening the door.",
    image: `${N}/2022.44.25/2022.44.25-Auto_Present_Door_Handles.png`,
    categories: ["Vehicle Control"],
  },
  "vehicle alarm": {
    description:
      "Adds a vehicle alarm that can sound and alert when unauthorized entry or tampering is detected, extending Model S security beyond simple lock status.",
    image: `${N}/2024.14/2024.14-preview-of-sentry-mode-recordings.png`,
    categories: ["Security"],
  },
  "ability to switch between metric and imperial units": {
    description:
      "Lets owners choose metric or imperial units for speed, distance, temperature, and related displays so the UI matches regional preferences.",
    image: `${N}/2021.40/2021.40-Range-Display.png`,
    categories: ["UI / Visualization"],
  },
  "range mode": {
    description:
      "An efficiency-focused driving mode that limits energy-hungry systems (climate aggressiveness and related draws) to stretch remaining range when you need every mile.",
    image: `${N}/2026.26/estimated-range.png`,
    categories: ["Scenario / Mode", "Vehicle OS"],
  },
  "usb sorting for media": {
    description:
      "Improves browsing of USB music libraries with clearer sorting/indexing so large collections of tracks and folders are easier to navigate on the media player.",
    image: `${N}/2026.14/2026.14-music-app-queuing.png`,
    categories: ["Audio"],
  },
  "ability to call phone numbers from map screen": {
    description:
      "Lets you place a phone call directly from a map place card or listed number while navigating, bridging maps and Bluetooth phone calling.",
    image: `${N}/2022.44.25/2022.44.25-Contact_Lookup.png`,
    categories: ["Phone Call"],
  },
  "fan speed and sunroof controls to steering wheel controls": {
    description:
      "Allows the steering-wheel scroll wheels to adjust fan speed or sunroof position (in addition to volume/temperature), so climate and roof controls are reachable without leaving the wheel.",
    image: WIKI_INTERIOR,
    categories: ["Comfort / Climate", "Vehicle Control"],
  },
  "location aware homelink": {
    description:
      "HomeLink garage/gate buttons become context-aware: the car preferentially offers the opener associated with your current location (for example home vs. another programmed site).",
    image: `${N}/2026.20.5/2026.20.5-arrival-options.png`,
    categories: ["Map / Navigation / Trip / Route", "Vehicle Control"],
  },
  "scheduled charging mode": {
    description:
      "Schedule when the car should charge (for off-peak utility rates or departure readiness) instead of charging immediately when plugged in.",
    image: `${N}/2024.26/undoc/next-scheduled.jpg`,
    categories: ["Range / Charging / Energy"],
  },
  "supercharger locations to maps": {
    description:
      "Plots Tesla Supercharger sites on the in-car map so drivers can find DC fast charging along a route or nearby without a separate lookup.",
    image:
      "https://www.notateslaapp.com/img/containers/article_images/2026/belgium-supercharger-site-maps.webp/04dcf92a8cba0057bdb22e021c5059ae/belgium-supercharger-site-maps.jpg",
    categories: ["Map / Navigation / Trip / Route", "Range / Charging / Energy"],
  },
  "visited chargers to maps": {
    description:
      "Remembers chargers you have used and surfaces them on the map for quicker return visits and trip planning.",
    image: `${N}/2025.44.25/2025.44.25-supercharger-site-maps.png`,
    categories: ["Map / Navigation / Trip / Route", "Range / Charging / Energy"],
  },
  "battery charge limit slider (standard and max range)": {
    description:
      "Adds a charge-limit control with Standard and Max Range (and finer limits over time) so owners can daily-charge below 100% to reduce battery stress while still topping up for long trips.",
    image: `${N}/2025.44.25/2025.44.25-save-charge-limit-by-location.png`,
    categories: ["Range / Charging / Energy"],
  },
  "contact sorting options": {
    description:
      "Adds sorting/indexing options for the phone contacts list on the touchscreen, making large Bluetooth address books easier to scan.",
    image: `${N}/2022.44.25/2022.44.25-Contact_Lookup.png`,
    categories: ["Phone Call"],
  },
  "new defrost mode": {
    description:
      "Dedicated windshield/defrost climate mode that prioritizes clearing glass quickly in cold or humid conditions from the climate UI.",
    image: `${N}/2024.2/2024.2-supercharging-in-cold-weather.png`,
    categories: ["Comfort / Climate"],
  },
  "battery support (will draw power from wall instead of battery for hvac)": {
    description:
      "When plugged in, cabin HVAC can run from wall power instead of depleting the traction battery—useful for preconditioning or keeping climate on while charging.",
    image: `${N}/2024.14/charging.jpg`,
    categories: ["Comfort / Climate", "Range / Charging / Energy"],
  },
  "battery ability to heat from utility instead of itself": {
    description:
      "Allows battery heating/preconditioning to draw from grid/wall power when plugged in, preserving pack energy and preparing the battery for efficient charging or departure.",
    image: `${N}/2025.2/2025.2-third-party-fast-charger-preconditioning.png`,
    categories: ["Range / Charging / Energy", "Vehicle OS"],
  },
  wifi: {
    description:
      "Adds Wi‑Fi connectivity so the car can download software updates and stream media over a home or hotspot network instead of relying only on cellular data.",
    image: `${N}/2024.38/wifi-2.jpg`,
    categories: ["Vehicle OS"],
  },
  "tow mode": {
    description:
      "Transport/tow mode for flatbed towing: holds the parking brake appropriately and reduces risk of drivetrain damage when the vehicle must be moved with wheels free.",
    image:
      "https://www.notateslaapp.com/img/containers/article_images/2025/cybertruck-over-weight-limit.webp/e1bb64f55fa46075debe644ee4ae3da5/cybertruck-over-weight-limit.jpg",
    categories: ["Trailering", "Scenario / Mode"],
  },
  "screen cleaning mode": {
    description:
      "Locks out touch input and often raises brightness so you can wipe the center display without accidentally tapping controls.",
    image: `${N}/2021.44/2021.44.25-Car_Wash_Mode.png`,
    categories: ["Display"],
  },
  "radio presets to steering wheel controls": {
    description:
      "Lets steering-wheel controls cycle radio presets so you can change stations without reaching for the touchscreen.",
    image:
      "https://www.notateslaapp.com/img/containers/article_images/2026/volume-icon.webp/c34d1fa61db7885c689603a0ba70b55d/volume-icon.jpg",
    categories: ["Audio"],
  },
  "tracking modes in map (north up or vehicle up)": {
    description:
      "Choose whether the map stays north-up or rotates with vehicle heading (heading-up), matching classic navigation preferences.",
    image: `${N}/2026.26/preferred-routes.png`,
    categories: ["Map / Navigation / Trip / Route"],
  },
  "current anomaly detection (auto reduce charging amp by 25% if problem is detected)": {
    description:
      "Monitors charging current for electrical anomalies and automatically reduces charge amperage (by ~25%) when a problem is detected to protect the wall circuit and vehicle charge equipment.",
    image: `${N}/2024.14/charging.jpg`,
    categories: ["Range / Charging / Energy", "Safety / Emergency"],
  },
  "wiper service mode": {
    description:
      "Moves the wipers to a service position so blades can be replaced safely without forcing the arms against the glass or hood.",
    image:
      "https://www.notateslaapp.com/img/containers/article_images/service-mode/front-camera-service-mode.webp/76b5f28b727394480599ab47122948e2/front-camera-service-mode.jpg",
    categories: ["Service / Support"],
  },
  "tpms reset option": {
    description:
      "Adds a tire-pressure monitoring system (TPMS) reset/relearn option after tire service or pressure changes so warnings clear correctly.",
    image: `${N}/2025.2/undoc/tire-pressure.jpg`,
    categories: ["Service / Support", "Vehicle Control"],
  },
  rdio: {
    description:
      "Integrates Rdio streaming music in the cabin media player (later replaced by Spotify after Rdio shut down), bringing cloud playlists to the Model S over the car’s data connection.",
    image: `${N}/2024.32/liveone-powered-by-slacker-radio.png`,
    categories: ["Media / Entertainment"],
  },
  "hill assist": {
    description:
      "Holds the vehicle briefly when starting on an incline so it does not roll backward before you apply throttle—helpful with strong regen and one-pedal driving habits.",
    image: `${N}/2024.14/dynamics-menu.jpg`,
    categories: ["Vehicle Control", "Safety / Emergency"],
  },
  "smart air suspension options (auto lower for highway speeds)": {
    description:
      "Automatically lowers air suspension at highway speeds for improved aero/efficiency and raises it again at lower speeds for comfort and clearance (on air-suspension cars).",
    image: `${N}/2023.12/suspension-options.jpg`,
    categories: ["Vehicle Control", "Comfort / Climate"],
  },
  "home and work locations": {
    description:
      "Save Home and Work as special destinations for one-tap navigation and later automatic navigation / calendar-aware routing.",
    image: `${N}/2026.26/automatic-navigation.png`,
    categories: ["Map / Navigation / Trip / Route"],
  },
  "asian font support for media player": {
    description:
      "Adds Asian-language font support in the media player so track and artist metadata in Chinese, Japanese, Korean, and related scripts render correctly.",
    image: `${N}/2025.14/2025.14-keyboard-languages.png`,
    categories: ["Media / Entertainment", "UI / Visualization"],
  },
  "fob reprogram/swap ability": {
    description:
      "Allows reprogramming or swapping key fobs from the vehicle UI so replacement or additional fobs can be paired without a service visit for simple swaps.",
    image: `${N}/2025.8/no-key-screen.jpg`,
    categories: ["Profile", "Service / Support"],
  },
  "slacker radio reset ability": {
    description:
      "Adds a reset control for Slacker Radio streaming when the service gets stuck, restoring playback without a full car reboot.",
    image: `${N}/2024.32/liveone-powered-by-slacker-radio.png`,
    categories: ["Audio"],
  },
  "traffic aware navigation": {
    description:
      "Navigation routing that accounts for live traffic when calculating ETA and suggesting alternate routes around congestion.",
    image: `${N}/2025.8/traffic.jpg`,
    categories: ["Map / Navigation / Trip / Route"],
  },
  calendar: {
    description:
      "In-car Calendar app that syncs upcoming events (with phone/account connectivity) so you can navigate to event locations and see schedule context on the touchscreen.",
    image: `${N}/2023.44/calendar.jpg`,
    categories: ["Productivity"],
  },
  "more power management options": {
    description:
      "Expands power-management settings that control how aggressively the car sleeps displays and background systems to balance vampire drain versus wake readiness.",
    image:
      "https://www.notateslaapp.com/img/containers/article_images/2024/eu_actually_smart_summon.jpg/9734acf94909828d4a6914d54813a5da/eu_actually_smart_summon.jpg",
    categories: ["Vehicle OS"],
  },
  "location based air suspension settings": {
    description:
      "Remembers preferred air-suspension ride heights for specific locations (driveways, steep approaches) and applies them automatically when you arrive.",
    image: `${N}/2023.12/suspension-options.jpg`,
    categories: ["Vehicle Control", "Comfort / Climate"],
  },
  "custom car name": {
    description:
      "Lets owners set a custom vehicle name shown in the car UI and mobile app instead of a generic Model S/X label.",
    image: `${N}/2022.24/2022.24-Driver_Profiles.png`,
    categories: ["UI / Visualization", "Mobile App"],
  },
  "international osk (onscreen keyboard)": {
    description:
      "Expands the on-screen keyboard with additional international layouts and character sets for entering destinations and search text worldwide.",
    image: `${N}/2026.14/2026.14-keyboard.png`,
    categories: ["UI / Visualization"],
  },
  "trip energy prediction": {
    description:
      "Predicts energy use for the planned route and shows expected battery level at arrival, helping decide whether a Supercharger stop is needed.",
    image: `${N}/2024.44.25/2024.44.25-set-arrival-energy.png`,
    categories: ["Map / Navigation / Trip / Route"],
  },
  "tacc to ap1 cars": {
    description:
      "Brings Traffic-Aware Cruise Control to Autopilot Hardware 1 cars: adaptive cruise that matches traffic speed and can follow the car ahead using the forward radar/camera suite.",
    image: `${N}/2023.44.25/aeb.jpg`,
    categories: ["Autopilot / Full Self-Driving"],
  },
  "auto high beam to ap1 cars": {
    description:
      "Automatically switches between high and low beams based on detected traffic and lighting conditions on Autopilot-equipped cars.",
    image: `${N}/2025.14/2025.14-adaptive-headlights.png`,
    categories: ["Autopilot / Full Self-Driving","Lighting"],
  },
  "forward collision warning to ap1 cars": {
    description:
      "Alerts the driver when a potential frontal collision is detected, giving time to brake or steer before Automatic Emergency Braking may intervene.",
    image: `${N}/2025.20/2025.20.3-forward-collision-warning-improvements.png`,
    categories: ["Autopilot / Full Self-Driving","Safety / Emergency"],
  },
  "energy option for battery display": {
    description:
      "Adds an energy (kWh/percentage) view alongside distance-based range so owners can monitor pack energy directly in the battery/energy display.",
    image: `${N}/2025.8/energy-app.jpg`,
    categories: ["UI / Visualization"],
  },
  "smart preconditioning (auto warm your car based on habits)": {
    description:
      "Learns typical departure patterns and can automatically precondition the cabin (and battery when relevant) before you usually leave, so the car is ready without a manual app request.",
    image: `${N}/2024.26/undoc/next-scheduled.jpg`,
    categories: ["Comfort / Climate"],
  },
  "reverse lines in backup cam": {
    description:
      "Overlays parking guidance lines on the backup camera view to help judge trajectory and distance while reversing.",
    image:
      "https://www.notateslaapp.com/img/containers/article_images/2025/intel-reverse-vis.webp/a2faab9fbff2d90d09f1baffd42fa9e3/intel-reverse-vis.jpg",
    categories: ["Camera"],
  },
  "parkview assist": {
    description:
      "Park Assist / Parkview uses ultrasonic sensors to chime and visualize nearby obstacles while parking at low speed.",
    image: `${N}/2025.20/2025.20.3-camera-updates.png`,
    categories: ["Camera","Autopilot / Full Self-Driving"],
  },
  "shuffle and repeat to media player": {
    description:
      "Adds long-requested shuffle and repeat controls to the cabin media player for USB and streaming libraries.",
    image: `${N}/2026.14/2026.14-music-app-queuing.png`,
    categories: ["Audio"],
  },
  "factory reset option": {
    description:
      "Provides a factory reset that erases profiles, Wi‑Fi credentials, HomeLink, and other personal data—important before selling or transferring the vehicle.",
    image: `${N}/2024.44.25/2024.44.25-maintenance-summary.png`,
    categories: ["Service / Support"],
  },
  "trip planner with routing via superchargers": {
    description:
      "Plans long-distance routes with automatic Supercharger stops, charging time estimates, and arrival energy targets so cross-country trips are navigable in one plan.",
    image: `${N}/2023.44.25/trip-planner-2.png`,
    categories: ["Map / Navigation / Trip / Route", "Range / Charging / Energy"],
  },
  "range assurance": {
    description:
      "Warns when your remaining range may not reach the entered destination (or next charger) and can suggest charging or a more conservative speed.",
    image: `${N}/2026.26/estimated-range.png`,
    categories: ["Map / Navigation / Trip / Route"],
  },
  "valet mode": {
    description:
      "Locks the glovebox/frunk, limits top speed and acceleration, hides destination/home data, and requires a PIN to exit—so you can hand the car to a valet with reduced access.",
    image: `${N}/2024.2/capture-pin-to-drive.jpg`,
    categories: ["Security"],
  },
  "blind spot warning": {
    description:
      "Warns when a vehicle is detected in the blind spot during lane changes, using Autopilot sensors to reduce side-collision risk.",
    image: `${N}/2024.44/2024.44-blind-spot-warning-while-parked.png`,
    categories: ["Autopilot / Full Self-Driving","Safety / Emergency"],
  },
  "aeb (auto emergency braking)": {
    description:
      "Automatic Emergency Braking applies the brakes if a frontal collision is imminent and the driver has not responded adequately to warnings.",
    image: `${N}/2023.44.25/aeb.jpg`,
    categories: ["Autopilot / Full Self-Driving","Safety / Emergency"],
  },
  "pin dropping to navigation map": {
    description:
      "Drop a pin anywhere on the map to navigate to an arbitrary coordinate—not only searched addresses or POIs.",
    image: `${N}/2026.26/preferred-routes.png`,
    categories: ["Map / Navigation / Trip / Route"],
  },
  "launch mode": {
    description:
      "Performance Launch Mode optimizes powertrain prep for maximum acceleration launches (preconditions motors/battery as applicable) on supported dual-motor Performance cars.",
    image: `${N}/2020.12.5/tesla/en/day/launch_mode.png`,
    categories: ["Performance"],
  },
  "clock widget": {
    description:
      "Adds an always-visible clock widget on the display so time is easy to see without opening another app.",
    image: WIKI_INTERIOR_2,
    categories: ["Display"],
  },
  "rwd torque sleep": {
    description:
      "On dual-motor cars, can reduce or idle rear-motor torque in light-load situations to improve efficiency (often discussed as rear-motor “torque sleep”).",
    image: `${N}/2024.14/dynamics-menu.jpg`,
    categories: ["Performance"],
  },
  "perpendicular autopark": {
    description:
      "Expands Autopark beyond parallel spaces to perpendicular (head-in/back-in) parking stalls using Autopilot ultrasonics and cameras.",
    image: `${N}/2024.2/2024.2-autopark.png`,
    categories: ["Autopilot / Full Self-Driving"],
  },
  "homelink auto open/close": {
    description:
      "Automatically opens or closes a programmed HomeLink garage door based on arrival/departure (and can pair with Summon’s Auto HomeLink setting).",
    image: `${N}/2026.20.5/2026.20.5-arrival-options.png`,
    categories: ["Vehicle Control", "Map / Navigation / Trip / Route"],
  },
  "auto brightness to display": {
    description:
      "Automatically adjusts center-display brightness for ambient light so the screen stays readable day and night without constant manual tweaks.",
    image: `${N}/2025.26/2025.26-light-sync.png`,
    categories: ["Display"],
  },
  "supercharger availability": {
    description:
      "Shows real-time Supercharger stall availability and site status (including temporary closures) on map pins so you can pick an open site before you arrive.",
    image: `${N}/2023.44.25/superchargers-amenities.jpg`,
    categories: ["Map / Navigation / Trip / Route", "Range / Charging / Energy"],
  },
  "spotify music service": {
    description:
      "Adds Spotify as an in-car streaming service (introduced as Rdio’s replacement), with account sign-in and playback through the cabin media UI.",
    image: `${N}/2026.14/2026.14-music-app-queuing.png`,
    categories: ["Audio"],
  },
  "summon to ap1 cars": {
    description:
      "Summon (Beta) lets you move the car forward/back into a parking space from outside using the key fob (within a limited distance), useful for tight garages—available on Autopilot-equipped cars of that era.",
    image: `${N}/2024.27/summon.png`,
    categories: ["Autopilot / Full Self-Driving"],
  },
  "supercharger amenities": {
    description:
      "Displays amenity information for Supercharger sites (restrooms, dining, Wi‑Fi, etc.) on the map so stops can be planned around more than just stalls.",
    image: `${N}/2023.44.25/superchargers-amenities.jpg`,
    categories: ["Map / Navigation / Trip / Route", "Range / Charging / Energy"],
  },
  "automatic driver profiles based on key fobs": {
    description:
      "Automatically selects the driver profile associated with the key fob that unlocked/approached the car, restoring seat and preference settings without a manual profile tap.",
    image: `${N}/2021.44/2021.44-Driver_Profiles.png`,
    categories: ["Profile"],
  },
  "2 car visibility to cars with ap": {
    description:
      "Improves Autopilot driving visualization to show additional surrounding vehicles (deeper traffic context ahead/adjacent) on the instrument cluster.",
    image: `${N}/2026.26/driving-visualization.png`,
    categories: ["Autopilot / Full Self-Driving","Display"],
  },
  "ability to name trip meter": {
    description:
      "Lets you assign custom names to trip meters (beyond Trip A/B) so energy/distance logs are easier to track per journey.",
    image:
      "https://www.notateslaapp.com/img/containers/article_images/tesla-update/trips-energy-app-reorder.webp/a256cf9ade845dd6f46f6935de28c175/trips-energy-app-reorder.jpg",
    categories: ["Map / Navigation / Trip / Route", "UI / Visualization"],
  },
  "swipe abilities in navigation": {
    description:
      "Adds swipe gestures on the navigation UI for faster interaction with the map and trip panels (for example dismissing or switching panels).",
    image: `${N}/2026.26/preferred-routes.png`,
    categories: ["Map / Navigation / Trip / Route", "UI / Visualization"],
  },
  "cabin overheat protection (cools the cabin if past 40c)": {
    description:
      "Automatically ventilates or cools the cabin if interior temperature exceeds a high threshold (about 40°C / 105°F) while parked, helping protect occupants, pets, and interior materials.",
    image: `${N}/2024.14/2024.14-cabin-overheat-protection.png`,
    categories: ["Comfort / Climate","Safety / Emergency"],
  },
  "homelink audio tone": {
    description:
      "Plays an audible confirmation tone when HomeLink transmits, so you know the garage/gate command was sent without watching the UI.",
    image: `${N}/2026.20.5/2026.20.5-arrival-options.png`,
    categories: ["Vehicle Control"],
  },
};

function normTitle(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function enrichFeature(feature) {
  if (!feature || feature.source !== "electrek") return feature;
  const key = normTitle(feature.title);
  const enrich = ENRICHMENT[key];
  if (!enrich) return feature;

  const categories = enrich.categories || feature.categories;
  return {
    ...feature,
    description: enrich.description || feature.description,
    image: enrich.image || feature.image,
    imageDark: feature.imageDark || null,
    categories,
    primaryCategory: categories?.[0] || feature.primaryCategory,
    enriched: true,
    enrichmentSource:
      "Researched from Tesla release notes / contemporary coverage; imagery from NotaTeslaApp feature screenshots or Wikimedia Commons Model S interior.",
  };
}

export function enrichElectrekPayload(payload) {
  if (!payload?.features) return payload;
  const features = payload.features.map(enrichFeature);
  const byId = new Map(features.map((f) => [f.id, f]));

  const releases = (payload.releases || []).map((rel) => ({
    ...rel,
    features: (rel.features || []).map((f) => {
      const full = byId.get(f.id);
      if (!full) return f;
      return {
        ...f,
        description: full.description,
        image: full.image,
        imageDark: full.imageDark,
        categories: full.categories,
        primaryCategory: full.primaryCategory,
      };
    }),
  }));

  return { ...payload, features, releases };
}

export function enrichReleasesFile(data) {
  if (!data?.features) return data;
  const features = data.features.map((f) =>
    f.source === "electrek" ? enrichFeature(f) : f
  );

  const electrekById = new Map(
    features.filter((f) => f.source === "electrek").map((f) => [f.id, f])
  );

  const releases = (data.releases || []).map((rel) => {
    if (rel.source !== "electrek") return rel;
    return {
      ...rel,
      features: (rel.features || []).map((f) => {
        const full = electrekById.get(f.id);
        if (!full) return f;
        return {
          ...f,
          description: full.description,
          image: full.image,
          imageDark: full.imageDark,
          categories: full.categories,
          primaryCategory: full.primaryCategory,
        };
      }),
    };
  });

  const categoryCounts = Object.fromEntries(
    (data.categories || []).map((c) => [c, 0])
  );
  for (const f of features) {
    for (const c of f.categories || []) {
      if (categoryCounts[c] != null) categoryCounts[c]++;
    }
  }

  return {
    ...data,
    features,
    releases,
    categoryCounts,
    electrekEnrichment: {
      enrichedAt: new Date().toISOString(),
      enrichedCount: features.filter((f) => f.enriched).length,
    },
  };
}

function main() {
  if (!existsSync(OUT)) {
    console.error(`Missing ${OUT}`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(OUT, "utf8"));
  const enriched = enrichReleasesFile(data);
  writeFileSync(OUT, JSON.stringify(enriched, null, 2));
  console.log(
    `Enriched ${enriched.electrekEnrichment.enrichedCount} Electrek features in ${OUT}`
  );

  if (existsSync(CACHE)) {
    const cache = JSON.parse(readFileSync(CACHE, "utf8"));
    writeFileSync(CACHE, JSON.stringify(enrichElectrekPayload(cache), null, 2));
    console.log(`Updated ${CACHE}`);
  }

  const missing = enriched.features
    .filter((f) => f.source === "electrek" && !f.enriched)
    .map((f) => f.title);
  if (missing.length) {
    console.warn("Unenriched titles:", missing);
  }

  const noImg = enriched.features.filter(
    (f) => f.source === "electrek" && !f.image
  ).length;
  console.log(`Electrek features without image: ${noImg}`);
}

const isDirect =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  main();
}
