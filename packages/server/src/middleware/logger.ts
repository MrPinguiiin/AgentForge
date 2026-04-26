import type { Context, Next } from "hono";

export async function requestLogger(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  const color =
    status >= 400 ? "\x1b[31m" : status >= 300 ? "\x1b[33m" : "\x1b[32m";
  const reset = "\x1b[0m";

  console.log(
    `${color}${method}${reset} ${path} ${color}${status}${reset} ${duration}ms`
  );
}
