import react from "@vitejs/plugin-react";
import { imagetools } from "vite-imagetools";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), imagetools()],
  build: {
    target: "es2022",
    // MapLibre alone is ~1 MB minified; it is the product here, not accidental bloat.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: "node",
  },
});
