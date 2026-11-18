import type { AgentOutput, FileNote, GraphEdge, GraphNode, Layer, Relationship } from "../shared/types.ts";

export type CrossCheckResult = {
  output: AgentOutput;  // only what matches the real graph
  warnings: string[];   // one line per thing that was dropped, for the server log
};

// Keeps only the parts of the agent's output that describe the real graph.
// The graph comes from git and ts-morph; the agent can label it but never add
// to it. Expects paths already normalized (normalizeAgentOutput).
//
// Pure: called again on every refresh, so a note for a file the agent wrote
// about before creating it starts to show as soon as the file appears.
export function crossCheck(output: AgentOutput, nodes: GraphNode[], edges: GraphEdge[]): CrossCheckResult {
  const warnings: string[] = [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edgeIds = new Set(edges.map((edge) => edge.id));

  return {
    output: {
      schemaVersion: output.schemaVersion,
      summary: output.summary,
      files: checkFiles(output.files, nodesById, warnings),
      layers: checkLayers(output.layers, nodesById, warnings),
      relationships: checkRelationships(output.relationships, edgeIds, warnings),
    },
    warnings,
  };
}

function checkFiles(files: FileNote[], nodesById: Map<string, GraphNode>, warnings: string[]): FileNote[] {
  const kept = new Map<string, FileNote>();
  for (const note of files) {
    const node = nodesById.get(note.path);
    if (!node) {
      warnings.push(`file note "${note.path}" does not match a file in the graph`);
    } else if (node.status === "unchangedImport") {
      // The spec gives grayed-out imports no tooltip: the agent didn't change them.
      warnings.push(`file note "${note.path}" is for an unchanged file`);
    } else if (kept.has(note.path)) {
      warnings.push(`file note "${note.path}" appears more than once; kept the first`);
    } else {
      kept.set(note.path, note);
    }
  }
  return [...kept.values()];
}

// A file belongs to at most one layer: the first one that lists it.
function checkLayers(layers: Layer[], nodesById: Map<string, GraphNode>, warnings: string[]): Layer[] {
  const layerOfPath = new Map<string, string>();  // path -> id of the layer that kept it
  const seenIds = new Set<string>();
  const kept: Layer[] = [];

  for (const layer of layers) {
    // The UI keys layer boxes by id, so two layers can't share one.
    if (seenIds.has(layer.id)) {
      warnings.push(`layer id "${layer.id}" is used more than once; kept the first`);
      continue;
    }
    seenIds.add(layer.id);

    const paths: string[] = [];
    for (const filePath of layer.paths) {
      const owner = layerOfPath.get(filePath);
      if (!nodesById.has(filePath)) {
        warnings.push(`layer "${layer.id}" lists "${filePath}", which is not in the graph`);
      } else if (owner === layer.id) {
        continue;  // listed twice in the same layer: harmless, keep one quietly
      } else if (owner !== undefined) {
        warnings.push(`"${filePath}" is in layers "${owner}" and "${layer.id}"; kept it in "${owner}"`);
      } else {
        layerOfPath.set(filePath, layer.id);
        paths.push(filePath);
      }
    }

    if (paths.length === 0) {
      warnings.push(`layer "${layer.id}" has no files in the graph; dropped it`);
    } else {
      kept.push({ ...layer, paths });
    }
  }
  return kept;
}

function checkRelationships(relationships: Relationship[], edgeIds: Set<string>, warnings: string[]): Relationship[] {
  const kept = new Map<string, Relationship>();
  for (const relationship of relationships) {
    // Same id format as GraphEdge.id.
    const id = `${relationship.source}->${relationship.target}`;
    if (!edgeIds.has(id)) {
      warnings.push(`relationship "${id}" does not match an import arrow`);
    } else if (kept.has(id)) {
      warnings.push(`relationship "${id}" appears more than once; kept the first`);
    } else {
      kept.set(id, relationship);
    }
  }
  return [...kept.values()];
}
