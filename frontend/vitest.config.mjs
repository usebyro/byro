import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tests run in jsdom with the same "@/..." imports the app uses.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.jsx"],
    include: ["src/**/*.test.{js,jsx,ts,tsx}"],
    css: false,
    restoreMocks: true,
    testTimeout: 15000, // a busy machine (dev servers running) can be slow on the first render of a file
  },
});
