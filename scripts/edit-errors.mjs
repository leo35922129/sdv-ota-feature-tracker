/**
 * Turn browser constraint-validation wording into an editor-facing message.
 */
export function explainEditFailure(err) {
  const msg = String(err?.message || err || "").trim();
  if (
    /did not match the expected pattern/i.test(msg) ||
    /match the requested format/i.test(msg)
  ) {
    return "Feature name allows spaces and punctuation. That browser message is from an image URL check, not the title. Save name and description as usual, or upload a PNG, JPEG, WebP, or GIF.";
  }
  return msg;
}

/** Assign an input value without throwing on Safari URL/file constraints. */
export function setInputValue(el, value) {
  if (!el) return;
  const next = value == null ? "" : String(value);
  const type = String(el.getAttribute("type") || el.type || "").toLowerCase();
  if (type !== "file") {
    try {
      el.type = "text";
    } catch {
      /* ignore */
    }
  }
  try {
    el.value = next;
  } catch {
    if (type === "file") return;
    el.setAttribute("value", next);
  }
}
