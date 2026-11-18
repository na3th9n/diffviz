import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FileFlowNode } from "../graph/elements.ts";

// One file in the graph. Its colour comes from the status and its border
// style from whether it is TypeScript; see .file-node in styles.css.
export function FileNode({ data }: NodeProps<FileFlowNode>) {
  const className = ["file-node", `file-node-${data.status}`, data.isTypeScript ? "file-node-ts" : "file-node-other"].join(" ");
  return (
    <div className={className}>
      {/* Arrows enter on the left and leave on the right, matching the left-to-right layout. */}
      <Handle type="target" position={Position.Left} isConnectable={false} className="file-node-handle" />
      <span className="file-node-label">{data.label}</span>
      {data.status === "renamed" && <span className="file-node-tag">renamed</span>}
      <Handle type="source" position={Position.Right} isConnectable={false} className="file-node-handle" />
    </div>
  );
}
