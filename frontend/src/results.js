// Swing result fields. Each is a single optional choice per swing, edited in
// the detail page and usable as library filters.
export const RESULT_FIELDS = [
  { key: "direction", label: "Direction", options: ["Pull", "Straight", "Push"] },
  { key: "shape", label: "Shape", options: ["Hook", "Draw", "Straight", "Fade", "Slice"] },
  { key: "contact", label: "Contact", options: ["Shank", "Heel", "Center", "Toe", "Whiff"] },
  { key: "compression", label: "Compression", options: ["Chunk", "Pure", "Topped"] },
];
