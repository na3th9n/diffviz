// Explains the node styles and the arrow, in the bottom-right corner of the graph.
const NODE_STYLES = [
  { className: "file-node-changed file-node-ts", label: "Changed" },
  { className: "file-node-unchangedImport file-node-ts", label: "Unchanged import" },
  { className: "file-node-changed file-node-other", label: "Non-TypeScript" },
  { className: "file-node-deleted file-node-ts", label: "Deleted" },
  { className: "file-node-renamed file-node-ts", label: "Renamed" },
];

export function Legend() {
  return (
    <div className="legend">
      <span className="section-label">Legend</span>
      {NODE_STYLES.map((style) => (
        <span key={style.label} className="legend-row">
          <span className={`legend-swatch ${style.className}`} />
          {style.label}
        </span>
      ))}
      <span className="legend-row">
        <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
          <path d="M1 5H18" stroke="#7c8592" strokeWidth="1.5" />
          <path d="M16 1L21 5L16 9z" fill="#7c8592" />
        </svg>
        Imports (depends on)
      </span>
    </div>
  );
}
