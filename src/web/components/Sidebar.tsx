import type { ProjectInfo } from "../../shared/types.ts";

type SidebarProps = {
  project: ProjectInfo | null;
  loadError: string | null;
};

export function Sidebar({ project, loadError }: SidebarProps) {
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
