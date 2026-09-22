import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// Identificador del build: el commit en Vercel, la hora en local. La app lo
// compara con /version.json para saber si hay una versión más nueva publicada.
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 12) || `local-${Date.now()}`;

function versionFile(): Plugin {
  return {
    name: "supernova-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

// La landing de fundadores (public/fundador/index.html) es la portada del dominio y la
// app vive en /app. En el build: el index.html de la app pasa a app.html y la landing se
// copia a la raíz con un pequeño guion al principio que manda a /app a quien:
//  · ya tiene sesión (el token de Supabase está en localStorage), o
//  · llega desde un enlace de correo (el token o el error viajan en el hash).
// vercel.json reescribe todo lo que no es un archivo a /app.html.
const ROOT_REDIRECT = `<script>(function(){try{var h=location.hash||"";var go=function(){location.replace("/app"+location.search+h)};if(/access_token=|refresh_token=|error_code=|type=(recovery|signup|magiclink|invite|email_change)/.test(h)){go();return}for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i)||"";if(/^sb-.+-auth-token$/.test(k)&&(localStorage.getItem(k)||"").indexOf("access_token")>-1){go();return}}}catch(e){}})();</script>`;

function landingAtRoot(): Plugin {
  const SPA = /^\/(?!assets\/|fundador\/|.*\.[a-z0-9]+(\?|$)).*/i; // rutas de la app (sin extensión)
  return {
    name: "supernova-landing-at-root",
    closeBundle() {
      const dist = path.resolve(__dirname, "dist");
      const appHtml = path.join(dist, "index.html");
      const landing = path.join(dist, "fundador", "index.html");
      if (!fs.existsSync(appHtml) || !fs.existsSync(landing)) return;
      fs.renameSync(appHtml, path.join(dist, "app.html"));
      const html = fs.readFileSync(landing, "utf8").replace(/<head>/i, `<head>\n  ${ROOT_REDIRECT}`);
      fs.writeFileSync(appHtml, html);
    },
    // `vite preview` local: igual que Vercel — la raíz es la landing y el resto de rutas, la app.
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? "/";
        const pathOnly = url.split("?")[0];
        if (pathOnly !== "/" && SPA.test(pathOnly)) req.url = "/app.html";
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), versionFile(), landingAtRoot(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Las librerías cambian poco y la app cambia en cada deploy: separadas,
        // quien vuelve solo descarga el código nuevo y el resto sale de su caché.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          motion: ["framer-motion"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
}));
