// Shared filtering/ordering for the library so the detail view's prev/next
// traverses swings in exactly the order they'd appear in the library.
import { GENERIC_ORDER } from "./clubs.js";

// Sessions with their swings filtered by the active tag + club filters.
export function filterSessions(data, tagFilter, clubFilter) {
  return (data.sessions || [])
    .map((s) => ({
      ...s,
      allTags: [...new Set(s.swings.flatMap((sw) => sw.tags || []))],
      swings: s.swings.filter((sw) =>
        (!clubFilter || (sw.club_generic || "Unassigned") === clubFilter) &&
        (!tagFilter || (sw.tags || []).includes(tagFilter))),
    }))
    .filter((s) => s.swings.length > 0);
}

// Linear [{ swing, session }] in the visible order for the current view.
export function orderedSwings(data, view, tagFilter, clubFilter) {
  const sessions = filterSessions(data, tagFilter, clubFilter);
  const flat = sessions.flatMap((s) => s.swings.map((sw) => ({ swing: sw, session: s })));
  if (view !== "club") return flat; // flat + by-session share the same order
  const rank = Object.fromEntries(GENERIC_ORDER.map((g, i) => [g, i]));
  return [...flat].sort(
    (a, b) => (rank[a.swing.club_generic || "Unassigned"] ?? 99) -
              (rank[b.swing.club_generic || "Unassigned"] ?? 99)
  );
}
