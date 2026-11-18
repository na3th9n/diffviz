import type { ProjectInfo } from "../../shared/types.ts";
import { paragraphs } from "../graph/elements.ts";

type SidebarProps = {
  project: ProjectInfo | null;
  loadError: string | null;
  summary: string | null;  // the agent's summary of the session part, if there is one
};

export function Sidebar({ project, loadError, summary }: SidebarProps) {
  const summaryParagraphs = summary === null ? [] : paragraphs(summary);
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="project-name">
          <FolderIcon />
          <span>{project?.name ?? (loadError ? "Unknown project" : "Loading…")}</span>
        </div>
        {project && <span className="project-path">{project.displayPath}</span>}
        {loadError && <span className="load-error">{loadError}</span>}
      </div>
      {summaryParagraphs.length > 0 && (
        <section className="sidebar-section">
          <span className="section-label">Session part summary</span>
          {/* Plain text on purpose: the agent's text is never rendered as HTML. */}
          {summaryParagraphs.map((paragraph, i) => (
            <p key={i} className="summary-paragraph">
              {paragraph}
            </p>
          ))}
        </section>
      )}
    </aside>
  );
}

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
