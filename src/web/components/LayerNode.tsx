import type { NodeProps } from "@xyflow/react";
import type { LayerFlowNode } from "../graph/elements.ts";

// A box around a group of related files, with the layer's name above it. The
// node's size comes from layoutGraph(); the top strip holds the name, and the
// box itself starts below it (see .layer-node in styles.css).
export function LayerNode({ data }: NodeProps<LayerFlowNode>) {
  return (
    <div className="layer-node">
      <span className="layer-name">{data.name}</span>
      <div className="layer-box" />
    </div>
  );
}
