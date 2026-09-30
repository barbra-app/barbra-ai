import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
  handleImageOptimization,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  [key: string]: unknown;
  ASSETS: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

function applyRuntimeEnvironment(env: Env) {
  globalThis.__BARBRA_RUNTIME_ENV__ = env;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") process.env[key] = value;
  }
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, context: ExecutionContext) {
    // Sites/Cloudflare provides runtime variables through Worker bindings.
    // Vinext server routes read process.env, so bridge string bindings before
    // dispatching the request while leaving service bindings untouched.
    applyRuntimeEnvironment(env);
    const url = new URL(request.url);
    if (url.pathname === "/_vinext/image") {
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES]);
    }
    return handler.fetch(request, env, context);
  },
};

export default worker;
