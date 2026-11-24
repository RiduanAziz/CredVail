import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }: { mode: string }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    test: {
      globals: true,
      environment: "node",
      env,
      include: ["test/**/*.test.ts", "test/**/*.spec.ts"],
      exclude: ["node_modules", "dist", ".next", "contracts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        exclude: ["node_modules/", "contracts/", "docs/"]
      }
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src")
      }
    }
  };
});
