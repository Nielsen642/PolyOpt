import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
//@ts-ignore
import * as feUtils from "fe-utils-core";
const getPlugin = feUtils.getPlugin || (feUtils as any).default?.getPlugin;
if (typeof getPlugin !== "function") {
	throw new Error("getPlugin is not available");
}
export default defineConfig({
  plugins: [react(),getPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
