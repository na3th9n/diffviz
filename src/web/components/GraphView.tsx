import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import type { GraphState } from "../../shared/types.ts";
import { toFlowElements, type FileFlowNode, type Tooltip as TooltipContent } from "../graph/elements.ts";
import { layoutGraph } from "../graph/layout.ts";
import { FileNode } from "./FileNode.tsx";
import { ArrowMarkers, ImportEdge } from "./ImportEdge.tsx";
import { Legend } from "./Legend.tsx";
import { Tooltip } from "./Tooltip.tsx";

// Defined outside the component: React Flow warns if these objects change between renders.
const nodeTypes: NodeTypes = { file: FileNode };
const edgeTypes: EdgeTypes = { import: ImportEdge };

type Hover = { content: TooltipContent; x: number; y: number };

export function GraphView({ graph }: { graph: GraphState }) {
  return (
    <ReactFlowProvider>
      <GraphCanvas graph={graph} />
    </ReactFlowProvider>
  );
}

function GraphCanvas({ graph }: { graph: GraphState }) {
  const { nodes: unplaced, edges } = useMemo(() => toFlowElements(graph), [graph]);
  // useNodesState also applies React Flow's own updates to the nodes, such as their
  // measured sizes, which useNodesInitialized below depends on.
  const [nodes, setNodes, onNodesChange] = useNodesState<FileFlowNode>([]);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lay out every new graph. If a newer graph arrives before an older layout
  // finishes, the cleanup marks the older one stale so it is never drawn over
  // the newer one.
  useEffect(() => {
    let stale = false;
    layoutGraph(unplaced, edges).then(
      (placed) => {
        if (stale) return;
        setNodes(placed);
        setLayoutError(null);
      },
      (error: unknown) => {
        if (stale) return;
        console.error("diffviz: graph layout failed:", error);
        setLayoutError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      stale = true;
    };
  }, [unplaced, edges]);

  useFitWhenNodesChange(nodes);

  const showTooltip = (event: MouseEvent, content: TooltipContent | null) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!content || !box) return setHover(null);
    setHover({ content, x: event.clientX - box.left, y: event.clientY - box.top });
  };

  return (
    <div className="graph-area graph-canvas" ref={containerRef}>
      <ArrowMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        // Read-only: the layout is recalculated on every update, so dragging would be undone.
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        minZoom={0.2}
        maxZoom={2}
        attributionPosition="top-right"
        onNodeMouseEnter={(event, node) => showTooltip(event, node.data.tooltip)}
        onNodeMouseMove={(event, node) => showTooltip(event, node.data.tooltip)}
        onNodeMouseLeave={() => setHover(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={2} color="#23262c" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      <Legend />
      {hover && <Tooltip content={hover.content} x={hover.x} y={hover.y} />}
      {layoutError && <div className="graph-error">Could not lay out the graph: {layoutError}</div>}
    </div>
  );
}

// Zooms to fit the whole graph when files are added or removed, but leaves the
// user's zoom alone when an update only changes nodes that are already there.
function useFitWhenNodesChange(nodes: FileFlowNode[]): void {
  const { fitView } = useReactFlow();
  // fitView needs each node's measured size; this turns true once React Flow
  // has drawn and measured the current nodes (and false again while new ones are added).
  const nodesMeasured = useNodesInitialized();
  const lastKey = useRef("");
  useEffect(() => {
    if (!nodesMeasured || nodes.length === 0) return;
    const key = nodes.map((node) => node.id).join("\n");
    if (key === lastKey.current) return;
    lastKey.current = key;
    // maxZoom 1: a small graph is shown at normal size instead of blown up.
    void fitView({ padding: 0.15, maxZoom: 1, duration: 200 });
  }, [nodesMeasured, nodes, fitView]);
}
