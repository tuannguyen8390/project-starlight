import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, the Vite server (5173) forwards API + media calls to the FastAPI backend.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      "/api": "http://localhost:8504",
      "/media": "http://localhost:8504",
    },
  },
});
