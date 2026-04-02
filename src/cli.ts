#!/usr/bin/env node
import * as http from "node:http";
import open from "open";
import { createHttpServer } from "./server.js";

const DEFAULT_PORT = 47890;
const PORT_TRIES = 50;

function getBasePort(): number {
  const raw = process.env.PORT;
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 65535) {
    console.warn(`Invalid PORT "${raw}", using ${DEFAULT_PORT}`);
    return DEFAULT_PORT;
  }
  return n;
}

function tryListen(
  server: http.Server,
  port: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onErr = (err: NodeJS.ErrnoException) => {
      cleanup();
      reject(err);
    };
    const onListen = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      server.removeListener("error", onErr);
      server.removeListener("listening", onListen);
    };
    server.once("error", onErr);
    server.once("listening", onListen);
    server.listen(port, "127.0.0.1");
  });
}

async function start(): Promise<{ server: http.Server; port: number }> {
  const base = getBasePort();
  let lastErr: Error | undefined;
  for (let i = 0; i < PORT_TRIES; i++) {
    const port = base + i;
    const server = createHttpServer();
    try {
      await tryListen(server, port);
      return { server, port };
    } catch (e) {
      lastErr = e as Error;
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE") {
        throw e;
      }
    }
  }
  throw lastErr ?? new Error("No free port");
}

async function main(): Promise<void> {
  const { server, port } = await start();
  const url = `http://127.0.0.1:${port}/`;
  console.log(`OpenClaw sessions viewer at ${url}`);
  console.log("Press Ctrl+C to stop.");

  try {
    await open(url);
  } catch {
    console.warn("Could not open browser automatically; open the URL manually.");
  }

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
