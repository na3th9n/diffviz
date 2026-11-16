import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webRoot = fileURLToPath(new URL("./src/web", import.meta.url));
const webOutDir = fileURLToPath(new URL("./dist/web", import.meta.url));

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  build: {
    outDir: webOutDir,
    emptyOutDir: true,
  },
});
