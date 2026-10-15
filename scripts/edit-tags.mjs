/**
 * Selected-tag reorder helpers. First tag is primary.
 * Pointer drag in the editor moves tags left/right without native HTML5 DnD.
 */

export function moveTagRelative(selected, moving, target, before) {
  const current = Array.isArray(selected) ? [...selected] : [];
  if (!moving || !current.includes(moving)) return current;
  const next = current.filter((c) => c !== moving);
  if (!target || !next.includes(target)) {
    next.push(moving);
    return next;
  }
  let to = next.indexOf(target);
  if (!before) to += 1;
  next.splice(to, 0, moving);
  return next;
}

export function dropBeforeFromPoint(rect, clientX) {
  if (!rect) return true;
  return clientX < rect.left + rect.width / 2;
}

/**
 * @param {{ cat: string, left: number, top: number, width: number, height: number }[]} chips
 */
export function nearestChipFromPoint(chips, clientX, clientY, excludeCat) {
  const others = (chips || []).filter((c) => c?.cat && c.cat !== excludeCat);
  if (!others.length) return null;
  let best = others[0];
  let bestDist = Infinity;
  for (const chip of others) {
    const cx = chip.left + chip.width / 2;
    const cy = chip.top + chip.height / 2;
    const d = (clientX - cx) ** 2 + (clientY - cy) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = chip;
    }
  }
  return best;
}

export function chipMetrics(el) {
  const r = el.getBoundingClientRect();
  return {
    cat: el.dataset.cat,
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
  };
}
