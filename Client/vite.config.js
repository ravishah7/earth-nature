
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    cesium(),
    tailwindcss(),
  ],

  // In development, forward /api/* to the Express server so the browser
  // sees a single origin (no CORS setup needed).
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
