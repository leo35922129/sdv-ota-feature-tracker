/**
 * Rivian category list and tagging rules.
 * Drive Assist & Autonomy matches ADAS/autonomy features only —
 * not generic "driver display / driver profile / driver seat" mentions.
 */

export const RIVIAN_CATEGORIES = [
  "Vehicle OS",
  "Drive Assist & Autonomy",
  "Mobile & Watch App",
  "Connectivity",
  "User Profile",
  "Charging",
  "Vehicle Control",
  "Drive Modes",
  "Comfort / Climate",
  "Media / Entertainment",
  "Audio",
  "Map / Navigation / Trip",
  "Camera",
  "Lighting",
  "Voice & AI",
  "Trailering",
  "Gaming",
  "Productivity",
  "Safety / Emergency",
  "Service / Support",
  "UI / Visualization",
  "Onboarding / Tutorial",
  "Scenario / Mode",
];

export const RIVIAN_CATEGORY_RULES = [
  [
    "User Profile",
    /\b(profile pin|driver profile|user profile|profile authentication|secure your profile)\b/i,
  ],
  [
    "Drive Assist & Autonomy",
    /(?:\bautonomy\+|\bdriver\+|\bdriver plus\b|\bdriver assistance\b|\brivian autonomy platform\b|\brivian autonomy\b|\bautonomy view\b|\badas\b|\benhanced highway assist\b|\bhighway assist\b|\bhwa\b|\badaptive cruise\b|\bacc\b|\blane change on command\b|\blane keeping\b|\blane centering\b|\blane keep assist\b|\buniversal hands[- ]free\b|\bhands[- ]off warning\b|\bhands[- ]on[- ]wheel\b|\bco-steer\b|\bsmart turn signal\b|\bgo chime\b|\bpark assist\b|\bautomatic emergency braking\b|\baeb\b|\bautomatic lane change\b)/i,
  ],
  [
    "Voice & AI",
    /\b(rivian assistant|okay,? rivian|hey,? rivian|voice assistant|alexa|\bai[- ]powered|okay rivian)\b/i,
  ],
  ["Trailering", /\b(trailer|trailering|tow|towing|hitch)\b/i],
  ["Gaming", /\b(\barcade\b|\bgaming\b|\bgames?\b|steam)\b/i],
  [
    "Camera",
    /\b(gear guard|dashcam|surround view|blind spot|rearview|\bcameras?\b|truck bed view)\b/i,
  ],
  [
    "Lighting",
    /\b(headlight|high beam|exterior light|interior light|accent light|puddle|light bar|tail light|automatic high)\b/i,
  ],
  [
    "Charging",
    /\b(charg(e|ing)|battery|range estimation|power outlet|dc fast|level 2|ran charging)\b/i,
  ],
  [
    "Map / Navigation / Trip",
    /\b(navigation|navigate|\bmaps?\b|\btrips?\b|waypoint|destination|route|road name)\b/i,
  ],
  [
    "Safety / Emergency",
    /\b(safety|emergency|security|collision|warning|passive locking|alarm)\b/i,
  ],
  [
    "Mobile & Watch App",
    /\b(mobile app|rivian app|phone key|watch app|apple watch|remote command|smartphone)\b/i,
  ],
  [
    "Audio",
    /\b(\baudio\b|speakers?|volume|equalizer|\beq\b|dolby|meridian|spatial audio|immersive|\bchimes?\b|ringtone|lock sound|error sound|notification sounds?|warning sounds?|alert sounds?|\bmusic\b|apple music|spotify|audible|iheart|\bradio\b|hd radio|amazon music|podcast|\bsounds?\b)\b/i,
  ],
  [
    "Connectivity",
    /\b(bluetooth|blue[\s-]?tooth|wi-?fi|\bwifi\b|hotspot|cellular|\blte\b|\b5g\b)\b/i,
  ],
  [
    "Media / Entertainment",
    /\b(media app|\bmusic\b|apple music|spotify|audible|\bradio\b|hd radio|podcast|streaming|theater|amazon music)\b/i,
  ],
  [
    "Comfort / Climate",
    /\b(climate|seat heat|seat cool|defrost|cabin temperature|pet comfort|camping)\b/i,
  ],
  [
    "Drive Modes",
    /\b(drive mode|off[- ]road|conserve|sport|all[- ]purpose|rock crawl|rally|sand|wading)\b/i,
  ],
  [
    "Vehicle Control",
    /\b(suspension|steering|brake|acceleration|wiper|horn|window|door|frunk|tailgate|gear tunnel|kneel|garage door|glove box)\b/i,
  ],
  [
    "Service / Support",
    /\b(service|diagnostics|bug fix|fixed a|reliability|owner.?s guide)\b/i,
  ],
  [
    "Productivity",
    /\b(calendar|google calendar|messaging|calling|productivity)\b/i,
  ],
  [
    "Onboarding / Tutorial",
    /\b(tutorial|onboarding|first[- ]time setup|walkthrough|tour your rivian)\b/i,
  ],
  [
    "Scenario / Mode",
    /\b(camp(ing)? mode|pet mode|gear guard mode|scenario|conserve mode|pet comfort)\b/i,
  ],
  [
    "UI / Visualization",
    /\b(center display|driver display|infotainment|theme|graphics|visual update|settings app|status bar|visualization)\b/i,
  ],
  [
    "Vehicle OS",
    /\b(rivianos|software update|operating system|firmware)\b/i,
  ],
];

export function categorizeRivian(title, description) {
  const text = `${title}\n${description}`
    .replace(/settings\s*>\s*driver\+/gi, "settings")
    .replace(/sound(?:s)? the alarm/gi, "trigger the alarm")
    .replace(/alarm to sound/gi, "alarm to trigger");
  const matches = [];
  for (const [cat, re] of RIVIAN_CATEGORY_RULES) {
    if (re.test(text)) matches.push(cat);
  }
  if (matches.length === 0) matches.push("Vehicle OS");
  const filtered =
    matches.length > 1 ? matches.filter((c) => c !== "Vehicle OS") : matches;
  return [...new Set(filtered)];
}
