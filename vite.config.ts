import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { sites } from "@openai/sites-vite-plugin";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const isWorkerBuild = mode === "sites-worker";
  const loadedEnvironment = loadEnv(mode, process.cwd(), "");
  const publicEnvironment = Object.fromEntries(
    Object.entries({ ...loadedEnvironment, ...process.env })
      .filter(([name]) => name.startsWith("NEXT_PUBLIC_")),
  );

  return {
    plugins: [react(), sites()],
    // The old application reads public configuration through process.env.
    // Vite has no Node process object in the browser, so freeze only explicitly
    // public values into the client bundle. Server secrets never enter this map.
    define: { "process.env": JSON.stringify(publicEnvironment) },
    resolve: {
      alias: {
        "@": resolve("./src"),
        "next/link": resolve("./src/sites/next-compat/link.tsx"),
        "next/navigation": resolve("./src/sites/next-compat/navigation.ts"),
      },
    },
    build: isWorkerBuild
      ? {
        emptyOutDir: false,
        lib: {
          entry: "src/sites/entry-server.tsx",
          formats: ["es"],
          fileName: () => "server/index.js",
        },
      }
      : {
        emptyOutDir: true,
      },
  };
});
