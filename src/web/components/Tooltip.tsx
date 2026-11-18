import type { Tooltip as TooltipContent } from "../graph/elements.ts";

type TooltipProps = {
  content: TooltipContent;
  x: number;  // cursor position inside the graph area, in pixels
  y: number;
};

// The hover card from the mockup: an accent label over a short description.
export function Tooltip({ content, x, y }: TooltipProps) {
  // Offset from the cursor so the card never sits under it and flickers.
  return (
    <div className="tooltip" style={{ left: x + 14, top: y + 14 }} role="tooltip">
      <span className="tooltip-title">{content.title}</span>
      <span className="tooltip-body">{content.body}</span>
    </div>
  );
}
