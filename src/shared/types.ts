// Types shared by the server and the UI.

// The project the App was launched in, shown at the top of the sidebar.
export type ProjectInfo = {
  name: string;         // folder name, e.g. "job-tracker"
  displayPath: string;  // absolute path, with the home directory shown as "~"
};
