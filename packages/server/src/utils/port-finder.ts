import * as net from "node:net";

/**
 * Check if a specific port is available (not in use).
 * Creates a temporary TCP server to probe the port.
 */
function isPortAvailable(port: number, host: string = "localhost"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" || err.code === "EACCES") {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

/**
 * Get a random port assigned by the OS.
 * Binds to port 0 which lets the OS pick an available port.
 */
function getRandomPort(host: string = "localhost"): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (err: Error) => {
      reject(err);
    });

    server.once("listening", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not determine port")));
      }
    });

    server.listen(0, host);
  });
}

export interface FindPortOptions {
  /** The preferred port to try first (default: 3000) */
  preferredPort?: number;
  /** Hostname to bind to (default: "localhost") */
  host?: string;
}

/**
 * Find an available port.
 *
 * Strategy:
 * 1. Try the preferred port (default 3000)
 * 2. If taken, let the OS assign a random available port
 *
 * @returns The available port number
 */
export async function findAvailablePort(options: FindPortOptions = {}): Promise<number> {
  const { preferredPort = 3000, host = "localhost" } = options;

  // First, try the preferred port
  const preferred = await isPortAvailable(preferredPort, host);
  if (preferred) {
    return preferredPort;
  }

  // Preferred port is taken — let the OS pick a random available port
  const randomPort = await getRandomPort(host);
  return randomPort;
}
