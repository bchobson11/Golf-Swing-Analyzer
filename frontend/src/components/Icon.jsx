// Inline SVG icons (stroke = currentColor, so they inherit button text color
// and turn white on active/blue buttons).
const STROKE = {
  width: 18, height: 18, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
};

export default function Icon({ name }) {
  switch (name) {
    case "select":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 3l7.2 17 2.5-7.3L21 10.2z" />
        </svg>
      );
    case "line":
      return (
        <svg {...STROKE}>
          <line x1="5" y1="19" x2="19" y2="5" />
          <circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="19" cy="5" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "angle":
      return (
        <svg {...STROKE}>
          <path d="M5 4v15h15" />
          <path d="M5 13a6 6 0 016 6" />
        </svg>
      );
    case "freehand":
      return (
        <svg {...STROKE}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      );
    case "circle":
      return (
        <svg {...STROKE}><circle cx="12" cy="12" r="9" /></svg>
      );
    case "eraser":
      return (
        <svg {...STROKE}>
          <path d="M15 4l5 5-9 9H6l-3-3z" />
          <path d="M7 18h13" />
        </svg>
      );
    case "undo":
      return (
        <svg {...STROKE}>
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h11a5 5 0 010 10h-4" />
        </svg>
      );
    case "redo":
      return (
        <svg {...STROKE}>
          <path d="M15 14l5-5-5-5" />
          <path d="M20 9H9a5 5 0 000 10h4" />
        </svg>
      );
    case "clear":
      return (
        <svg {...STROKE}>
          <path d="M3 6h18" />
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          <path d="M10 6V4a2 2 0 012-2h0a2 2 0 012 2v2" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      );
    case "pose":
      return (
        <svg {...STROKE}>
          <circle cx="12" cy="4.5" r="2" />
          <path d="M12 6.5v6.5" />
          <path d="M6 9l6 2 6-2" />
          <path d="M12 13l-3 7M12 13l3 7" />
        </svg>
      );
    case "volume":
      return (<svg {...STROKE}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a3 3 0 010 6" /><path d="M19 6.5a7 7 0 010 11" /></svg>);
    case "mute":
      return (<svg {...STROKE}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></svg>);
    case "replay":
      return (<svg {...STROKE}><path d="M3 12a9 9 0 1 0 2.6-6.4" /><path d="M3 4v4h4" /></svg>);
    case "play":
      return (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>);
    case "pause":
      return (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>);
    default:
      return null;
  }
}
