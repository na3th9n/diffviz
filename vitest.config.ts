import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose root is src/web.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Many tests run real git and ts-morph on temp repositories. Alone they take
    // 1–2 s, but with every test file running in parallel some take 3 s or more,
    // so the default 5 s limit was too tight.
    testTimeout: 15_000,
    environment: "node",
  },
});
