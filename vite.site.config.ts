import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The static website deployed to Vercel: a homepage (site/index.html) and the
// read-only demo (site/demo/), which renders a recorded session part with the
// App's own components. No server is involved.
const siteRoot = fileURLToPath(new URL("./site", import.meta.url));

export default defineConfig({
  root: siteRoot,
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./dist/site", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL("./site/index.html", import.meta.url)),
        demo: fileURLToPath(new URL("./site/demo/index.html", import.meta.url)),
      },
    },
  },
});
