type RuntimeEnvironment = Record<string, unknown>;

declare global {
  // Sites exposes production configuration as Cloudflare Worker bindings.
  // The server bundle reads this shared object instead of depending solely on
  // the Node process shim, which is isolated in the Worker runtime.
  var __BARBRA_RUNTIME_ENV__: RuntimeEnvironment | undefined;
}

async function cloudflareEnvironment(): Promise<RuntimeEnvironment | undefined> {
  try {
    const module = await import("cloudflare:workers");
    return module.env as RuntimeEnvironment;
  } catch {
    return globalThis.__BARBRA_RUNTIME_ENV__;
  }
}

export async function runtimeEnv(key: string): Promise<string | undefined> {
  const runtimeValue = (await cloudflareEnvironment())?.[key];
  return typeof runtimeValue === "string" ? runtimeValue : process.env[key];
}
