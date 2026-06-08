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

// Flat list of result fields (the detail "Results" section).
export const RESULT_FIELDS = RESULT_GROUPS.flatMap((g) => g.fields);

// Camera angle is a per-swing setup attribute (set at upload, editable in the
// detail view) — single-select like a result, but shown separately.
export const CAMERA_ANGLE = {
  key: "camera_angle", label: "Camera angle", options: ["Down the Line", "Face On"],
};

// Single-select swing attributes used for sidebar filters + filtering + state.
export const FILTER_FIELDS = [...RESULT_FIELDS, CAMERA_ANGLE];
