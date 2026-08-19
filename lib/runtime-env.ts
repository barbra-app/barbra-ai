type RuntimeEnvironment = Record<string, unknown>;

declare global {
  // Sites exposes production configuration as Cloudflare Worker bindings.
  // The server bundle reads this shared object instead of depending solely on
  // the Node process shim, which is isolated in the Worker runtime.
  var __BARBRA_RUNTIME_ENV__: RuntimeEnvironment | undefined;
}

export function runtimeEnv(key: string): string | undefined {
  const runtimeValue = globalThis.__BARBRA_RUNTIME_ENV__?.[key];
  return typeof runtimeValue === "string" ? runtimeValue : process.env[key];
}
