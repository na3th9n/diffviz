// The graph view. In this part it only shows the empty state;
// the graph itself is drawn from Part 4 on.
export function GraphArea() {
  return (
    <div className="graph-area">
      <div className="empty-state">
        <p className="empty-title">No changes yet</p>
        <p className="empty-body">Changes to this project will appear here as a graph.</p>
      </div>
    </div>
  );
}
