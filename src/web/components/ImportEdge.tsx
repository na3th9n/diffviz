import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { ImportFlowEdge } from "../graph/elements.ts";

// Ids of the arrowheads defined once in <ArrowMarkers>.
export const ARROW = "diffviz-arrow";
export const ARROW_DIM = "diffviz-arrow-dim";
export const ARROW_HOVER = "diffviz-arrow-hover";

// One import arrow, from the importer to the file it imports. The colour, width
// and arrowhead are set in styles.css, so hovering can change them with CSS alone.
export function ImportEdge(props: EdgeProps<ImportFlowEdge>) {
  const [path] = getBezierPath(props);
  const className = props.data?.toUnchanged ? "import-edge import-edge-dim" : "import-edge";
  return <BaseEdge id={props.id} path={path} className={className} />;
}

// The three filled-triangle arrowheads: normal, to a grayed-out file, and hovered.
// Rendered once; every edge refers to them by id from CSS.
export function ArrowMarkers() {
  return (
    <svg className="arrow-markers" aria-hidden="true">
      <defs>
        <Marker id={ARROW} color="#7c8592" />
        <Marker id={ARROW_DIM} color="#4f5560" />
        <Marker id={ARROW_HOVER} color="#8fbaff" />
      </defs>
    </svg>
  );
}

function Marker({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" fill={color} />
    </marker>
  );
}
