import { CLUB_TAXONOMY, clubValue, parseClubValue } from "../clubs.js";

// One grouped dropdown: pick a generic category ("… (generic)") or a specific
// club within it. Emits { club_specific, club_generic } via onChange.
export default function ClubPicker({ club, onChange, className }) {
  return (
    <select
      className={`club-picker ${className || ""}`}
      value={clubValue(club)}
      onChange={(e) => onChange(parseClubValue(e.target.value))}
    >
      <option value="">No club</option>
      {CLUB_TAXONOMY.map((g) =>
        g.clubs.length === 1 && g.clubs[0] === g.generic ? (
          <option key={g.generic} value={`s:${g.clubs[0]}`}>{g.clubs[0]}</option>
        ) : (
          <optgroup key={g.generic} label={g.generic}>
            <option value={`g:${g.generic}`}>{g.generic} (generic)</option>
            {g.clubs.map((c) => (
              <option key={c} value={`s:${c}`}>{c}</option>
            ))}
          </optgroup>
        )
      )}
    </select>
  );
}
