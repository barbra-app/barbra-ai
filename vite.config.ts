import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

export default defineConfig(async ({ command, mode }) => {
  const loadedEnvironment = loadEnv(mode, process.cwd(), "");
  const localVariables = command === "serve"
    ? Object.fromEntries(Object.entries({ ...loadedEnvironment, ...process.env }).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  const localBindingConfig = {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    d1_databases: hostingConfig.d1 ? [] : [],
    r2_buckets: hostingConfig.r2 ? [] : [],
    vars: localVariables,
  };
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    plugins: [
      vinext(),
      sites(),
      cloudflare({ viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] }, config: localBindingConfig }),
    ],
  };
});
