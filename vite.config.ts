import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    open: true,
    // Sandboxed/remote dev hosts (e.g. an *.e2b.app preview proxy) reach the
    // dev server under a hostname Vite does not know about. This only affects
    // local development; the production build is static files served by the
    // host chosen in docs/operations/deployment.md.
    host: true,
    allowedHosts: true,
  },
  preview: { port: 5173, host: true, allowedHosts: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          vendor: ["@supabase/supabase-js", "date-fns", "lucide-react", "clsx", "tailwind-merge"],
        },
      },
    },
  },
});
