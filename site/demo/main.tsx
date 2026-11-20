import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { AppState, ProjectInfo } from "../../src/shared/types.ts";
import { AppLayout } from "../../src/web/App.tsx";
import "../../src/web/styles.css";
import "./demo.css";
import recordingJson from "./recording/session.json";

// Written by scripts/record-demo.ts: what the server sent the UI at the end of
// a real session part of this repository.
type DemoRecording = {
  project: ProjectInfo;
  state: AppState;
  recordedFrom: { base: string; head: string };
};

// JSON imports are typed loosely (e.g. "changed" is just a string), so the
// recording is given its real type here; record-demo.ts wrote it from that type.
const recording = recordingJson as unknown as DemoRecording;

const REPO_URL = "https://github.com/na3th9n/diffviz";

function DemoBanner() {
  const { base, head } = recording.recordedFrom;
  return (
    <div className="demo-banner">
      <span>
        <strong>Read-only demo.</strong> A recorded session part of diffviz itself (
        <a href={`${REPO_URL}/compare/${base}...${head}`}>
          <span className="mono">{base}</span> → <span className="mono">{head}</span>
        </a>
        ). Hover files, arrows and layer boxes to read the agent's labels.
      </span>
      <span className="demo-banner-links">
        <a href="/">About diffviz</a>
        <a href={REPO_URL}>GitHub</a>
      </span>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element in index.html");

createRoot(rootElement).render(
  <StrictMode>
    <AppLayout
      project={recording.project}
      loadError={null}
      state={recording.state}
      connection="open"
      banner={<DemoBanner />}
    />
  </StrictMode>,
);
