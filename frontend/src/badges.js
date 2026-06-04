// Card badge categories. Each has its own color. "notes" renders as an icon
// (only shown when the swing has a note); the rest render their value.
export const BADGE_DEFS = [
  { key: "club", label: "Club", color: "#3b82f6" },
  { key: "direction", label: "Direction", color: "#22d3ee" },
  { key: "shape", label: "Shape", color: "#a78bfa" },
  { key: "contact", label: "Contact", color: "#f59e0b" },
  { key: "compression", label: "Compression", color: "#f472b6" },
  { key: "tags", label: "Tags", color: "#34d399" },
  { key: "notes", label: "Notes", color: "#94a3b8" },
];

export const DEFAULT_BADGES = { club: true, notes: true };
