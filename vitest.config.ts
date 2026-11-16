import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose root is src/web.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
