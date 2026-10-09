import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@zxing")) return "qr-scanner";
          if (id.includes("/qrcode/")) return "qr-export";
        },
      },
    },
  },
  clearScreen: false,
});
