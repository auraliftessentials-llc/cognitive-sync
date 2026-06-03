import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import path from "path";

export default defineConfig({
  vite: ({ mode }) => {
    const serverEnv = loadEnv(mode, process.cwd(), "");
    Object.assign(process.env, serverEnv);
    return {
      resolve: {
        alias: {
          "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
          "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
          "entities": path.resolve(__dirname, "node_modules/entities"),
        },
      },
    };
  },
});
