export default function SwingList({ clips, onBack }) {
  return (
    <div className="results">
      <div className="toolbar">
        <span className="count">{clips.length} clips exported</span>
        <button onClick={onBack}>← Back to review</button>
      </div>
      <div className="clip-grid">
        {clips.map((clip) => (
          <div className="clip-card" key={clip.id}>
            <h3>Swing {clip.index + 1}</h3>
            <video src={clip.url} controls className="clip-player" />
            <a className="download" href={clip.url} download={`swing-${clip.index + 1}.mp4`}>
              ⤓ Download
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
