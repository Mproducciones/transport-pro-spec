import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiProxy = {
  "/api": {
    target: "http://localhost:4000",
    changeOrigin: true,
  },
} as const;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { ...apiProxy },
  },
  preview: {
    port: 5173,
    proxy: { ...apiProxy },
  },
});
