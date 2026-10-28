/**
 * The Hiring Portal's Location filter.
 *
 * A candidate's place is free text, typed by HR or carried in from an imported
 * sheet, so one town arrives as "Chennai", "chennai " and "CHENNAI". Here they
 * are one choice. Kept free of React so the rules can be checked on their own.
 */

// What the table already shows as "N/A": a sheet that wrote N/A in the cell
// means the same as one that left it empty.
const EMPTY = new Set(["", "n/a", "na", "-", "nil", "none", "null"]);

export const NO_LOCATION = "__none__";

function spelling(text) {
  return String(text ?? "").trim().replace(/\s+/g, " ");
}

export function locationKey(text) {
  const key = spelling(text).toLowerCase();
  return EMPTY.has(key) ? "" : key;
}

// Present and Perm both count: someone staying in Chennai whose home is Salem
// is found under either, and only once under Chennai when both say Chennai.
function keysOf(candidate) {
  const keys = [candidate.present_address, candidate.permanent_address].map(locationKey);
  return [...new Set(keys.filter(Boolean))];
}

/**
 * Every place with how many candidates it finds, most candidates first, each
 * labelled with its most common spelling; and how many candidates have no place
 * at all.
 */
export function locationOptions(candidates) {
  const byKey = new Map();
  let none = 0;
  for (const candidate of candidates) {
    const keys = keysOf(candidate);
    if (keys.length === 0) none += 1;
    for (const key of keys) {
      if (!byKey.has(key)) byKey.set(key, { count: 0, spellings: new Map() });
      byKey.get(key).count += 1;
    }
    for (const text of [candidate.present_address, candidate.permanent_address]) {
      const key = locationKey(text);
      if (!key) continue;
      const spellings = byKey.get(key).spellings;
      const written = spelling(text);
      spellings.set(written, (spellings.get(written) || 0) + 1);
    }
  }
  const places = [...byKey].map(([value, { count, spellings }]) => {
    const [label] = [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return { value, label, count };
  });
  places.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { places, none };
}

/** Whether the candidate is in the chosen place; "" chooses everyone. */
export function matchesLocation(candidate, chosen) {
  if (!chosen) return true;
  const keys = keysOf(candidate);
  if (chosen === NO_LOCATION) return keys.length === 0;
  return keys.includes(chosen);
}
