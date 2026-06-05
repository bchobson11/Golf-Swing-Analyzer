// Star favorite toggle. Filled (gold) when favorited, outline otherwise.
// Tooltip says what clicking will do.
function Star({ filled }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 2.6l2.82 5.72 6.31.92-4.57 4.45 1.08 6.29L12 17.98 6.36 19.98l1.08-6.29L2.87 9.24l6.31-.92z" />
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
      <Star filled={favorite} />
    </button>
  );
}
