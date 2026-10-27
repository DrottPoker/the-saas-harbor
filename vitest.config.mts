import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Unit tests run server modules directly; the marker only guards client bundles.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
      // Server code reads the request's language from next-intl; tests choose it themselves.
      "next-intl/server": fileURLToPath(
        new URL("./tests/unit/support/next-intl-server.ts", import.meta.url),
      ),
    },
  },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
