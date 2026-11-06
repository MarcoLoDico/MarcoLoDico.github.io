import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { imagetools } from "vite-imagetools";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), imagetools()],
  build: {
    target: "es2022",
    // MapLibre alone is ~1 MB minified; it is the product here, not accidental bloat.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        flight: resolve(import.meta.dirname, "flight/index.html"),
      },
    },
  },
  test: {
    environment: "node",
  },
});
