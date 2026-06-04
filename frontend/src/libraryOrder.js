// Shared filtering/ordering for the library so the detail view's prev/next
// traverses swings in exactly the order they'd appear in the library.
import { GENERIC_ORDER } from "./clubs.js";
import { RESULT_FIELDS } from "./results.js";

// Sessions with their swings filtered by the active filters.
// filters = { tag, club, results: { <field>: value, ... } }
export function filterSessions(data, filters = {}) {
  const { tag, club, results = {} } = filters;
  const matches = (sw) =>
    (!club || (sw.club_generic || "Unassigned") === club) &&
    (!tag || (sw.tags || []).includes(tag)) &&
    RESULT_FIELDS.every((f) => !results[f.key] || sw[f.key] === results[f.key]);
  return (data.sessions || [])
    .map((s) => ({
      ...s,
      allTags: [...new Set(s.swings.flatMap((sw) => sw.tags || []))],
      swings: s.swings.filter(matches),
    }))
    .filter((s) => s.swings.length > 0);
}

// Linear [{ swing, session }] in the visible order for the current view.
export function orderedSwings(data, view, filters = {}) {
  const sessions = filterSessions(data, filters);
  const flat = sessions.flatMap((s) => s.swings.map((sw) => ({ swing: sw, session: s })));
  if (view !== "club") return flat; // flat + by-session share the same order
  const rank = Object.fromEntries(GENERIC_ORDER.map((g, i) => [g, i]));
  return [...flat].sort(
    (a, b) => (rank[a.swing.club_generic || "Unassigned"] ?? 99) -
              (rank[b.swing.club_generic || "Unassigned"] ?? 99)
  );
}
