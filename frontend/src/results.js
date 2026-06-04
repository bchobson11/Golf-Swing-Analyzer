// Swing result fields, grouped for the detail page. Each is a single optional
// choice per swing, edited in the detail page and usable as library filters.
export const RESULT_GROUPS = [
  {
    label: "Ball flight",
    fields: [
      { key: "direction", label: "Direction", options: ["Pull", "Straight", "Push"] },
      { key: "shape", label: "Shape", options: ["Hook", "Draw", "Straight", "Fade", "Slice"] },
    ],
  },
  {
    label: "Strike",
    fields: [
      { key: "contact", label: "Contact", options: ["Shank", "Heel", "Center", "Toe", "Whiff"] },
      { key: "compression", label: "Compression", options: ["Chunk", "Pure", "Topped"] },
    ],
  },
];

// Flat list (sidebar filters, filtering, state init).
export const RESULT_FIELDS = RESULT_GROUPS.flatMap((g) => g.fields);
