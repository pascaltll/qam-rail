import path from "path";
const here = new URL(".", import.meta.url).pathname;
export default {
  root: here,
  resolve: { alias: [
    { find: "@decky/ui", replacement: path.join(here, "decky-ui.tsx") },
    { find: "@decky/api", replacement: path.join(here, "decky-api.ts") },
    { find: /^\.\/panelBridge$/, replacement: path.join(here, "panelBridge.ts") },
  ] },
  build: { outDir: path.join(here, "dist"), emptyOutDir: true, minify: false },
};
