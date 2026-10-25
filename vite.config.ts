import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  resolve: { alias: [{ find: /^vm$/, replacement: path.resolve(__dirname, "src/renderer/vm-shim.ts") }] },
  build: { outDir: "../../dist/renderer", emptyOutDir: true }
});
