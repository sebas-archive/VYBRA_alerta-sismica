import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// ADMIN de VYBRA: se compila a estático en ../public/admin (rutas relativas; lo sirve web/server.js).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  build: { outDir: "../public/admin", emptyOutDir: true, sourcemap: false },
});
