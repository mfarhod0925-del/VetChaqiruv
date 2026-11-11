import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null, // main.jsx o'zi ro'yxatdan o'tkazadi (Telegram ichida emas)
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "VetChaqiruv",
        short_name: "VetChaqiruv",
        description: "Chorvadorlarni veterinar va vet-dorixonalar bilan bog'laydigan ilova",
        lang: "uz",
        start_url: "/",
        display: "standalone",
        background_color: "#eef1ea",
        theme_color: "#25523a",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // Supabase so'rovlari keshlanmaydi — har doim yangi ma'lumot
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes("fonts.g"),
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 20, maxAgeSeconds: 31536000 } },
          },
        ],
      },
    }),
  ],
});
