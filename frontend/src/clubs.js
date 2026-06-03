// Club taxonomy. A swing can carry a specific club and/or a generic category.
// Picking a specific club auto-fills its generic category; you can also pick
// just the generic category and leave the specific club empty.

export const CLUB_TAXONOMY = [
  { generic: "Driver", clubs: ["Driver"] },
  { generic: "Wood", clubs: ["3 Wood", "5 Wood", "7 Wood"] },
  { generic: "Long Iron", clubs: ["2 Iron", "3 Iron", "4 Iron", "5 Iron"] },
  { generic: "Short Iron", clubs: ["6 Iron", "7 Iron", "8 Iron", "9 Iron"] },
  { generic: "Wedge", clubs: ["Pitching Wedge", "Gap Wedge", "Sand Wedge", "Lob Wedge"] },
];

// Display + grouping order, with a bucket for swings that have no club.
export const GENERIC_ORDER = [...CLUB_TAXONOMY.map((c) => c.generic), "Unassigned"];

export function genericFor(specific) {
  const group = CLUB_TAXONOMY.find((g) => g.clubs.includes(specific));
  return group ? group.generic : null;
}

// Short human label for a swing's club (specific wins, else generic, else null).
export function clubLabel(club) {
  if (!club) return null;
  return club.club_specific || club.club_generic || null;
}

// <select> value encoding: "s:<specific>" or "g:<generic>" or "" (unassigned).
export function clubValue(club) {
  if (!club) return "";
  if (club.club_specific) return `s:${club.club_specific}`;
  if (club.club_generic) return `g:${club.club_generic}`;
  return "";
}

export function parseClubValue(value) {
  if (!value) return { club_specific: null, club_generic: null };
  const kind = value.slice(0, 1);
  const name = value.slice(2);
  if (kind === "s") return { club_specific: name, club_generic: genericFor(name) };
  return { club_specific: null, club_generic: name };
}
