import type { Context, Next } from "hono";

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    const status = (error as { status?: number }).status || 500;

    console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, message);

    return c.json(
      {
        error: true,
        message,
        status,
      },
      status as 400 | 404 | 500
    );
  }
}
