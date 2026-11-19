import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    server: { entry: "server" },
    prerender: { enabled: true, failOnError: true },
  },
  vite: {
    build: { outDir: ".native-build" },
    environments: {
      client: { build: { outDir: "native-web" } },
    },
  },
});
