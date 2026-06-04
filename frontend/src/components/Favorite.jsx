// Golf-ball favorite toggle. Filled (white) when favorited, outline otherwise.
// Tooltip says what clicking will do.
function GolfBall({ filled }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor" strokeWidth="2" />
      <g fill={filled ? "rgba(0,0,0,0.28)" : "currentColor"}>
        <circle cx="9" cy="10" r="1" />
        <circle cx="15" cy="10" r="1" />
        <circle cx="12" cy="13.4" r="1" />
        <circle cx="9.4" cy="14.8" r="0.9" />
        <circle cx="14.6" cy="14.8" r="0.9" />
      </g>
    </svg>
  );
}

export default function Favorite({ favorite, onToggle, className = "" }) {
  return (
    <button
      className={`icon-btn favorite ${favorite ? "on" : ""} ${className}`}
      data-tip={favorite ? "Unfavorite" : "Favorite"}
      aria-label={favorite ? "Unfavorite swing" : "Favorite swing"}
      aria-pressed={favorite}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      <GolfBall filled={favorite} />
    </button>
  );
}
