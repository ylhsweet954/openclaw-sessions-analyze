import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHttpServer } from "../src/server.js";

const SID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const r = await fetch(url);
  const text = await r.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = text;
  }
  return { status: r.status, body };
}

describe("HTTP server", () => {
  let server: http.Server;
  let port: number;
  let base: string;

  beforeEach(async () => {
    server = createHttpServer();
    port = 0;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const a = server.address();
        if (typeof a === "object" && a?.port) port = a.port;
        resolve();
      });
    });
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("GET /api/health", async () => {
    const { status, body } = await fetchJson(`${base}/api/health`);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("GET /api/config returns defaultRoot", async () => {
    const { status, body } = await fetchJson(`${base}/api/config`);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      defaultRoot: path.join(
        os.homedir(),
        ".openclaw",
        "agents",
        "main",
        "sessions"
      ),
    });
  });

  it("GET /api/list with fixture root returns sessions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "osa-http-"));
    try {
      await fs.writeFile(
        path.join(dir, "sessions.json"),
        JSON.stringify({
          k: {
            sessionId: SID,
            updatedAt: 9999,
            lastChannel: "ch",
          },
        }),
        "utf8"
      );
      await fs.writeFile(
        path.join(dir, `${SID}.jsonl`),
        '{"type":"session"}\n',
        "utf8"
      );

      const q = `?root=${encodeURIComponent(dir)}`;
      const { status, body } = await fetchJson(`${base}/api/list${q}`);
      expect(status).toBe(200);
      const b = body as {
        root: string;
        sessions: Array<{ sessionId: string; fileName: string }>;
      };
      expect(b.root).toBe(path.resolve(dir));
      expect(b.sessions.some((s) => s.sessionId === SID)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("GET /api/list with bad root returns 400", async () => {
    const bad = path.join(os.tmpdir(), "osa-missing-" + Date.now());
    const q = `?root=${encodeURIComponent(bad)}`;
    const { status, body } = await fetchJson(`${base}/api/list${q}`);
    expect(status).toBe(400);
    const b = body as { error?: string };
    expect(b.error).toBeDefined();
  });

  it("GET /api/session with file loads transcript", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "osa-http-"));
    try {
      await fs.writeFile(
        path.join(dir, `${SID}.jsonl`),
        '{"type":"x","v":1}\n',
        "utf8"
      );
      const file = `${SID}.jsonl`;
      const q = `?file=${encodeURIComponent(file)}&root=${encodeURIComponent(dir)}`;
      const { status, body } = await fetchJson(
        `${base}/api/session/${encodeURIComponent(SID)}${q}`
      );
      expect(status).toBe(200);
      const b = body as {
        lines: Array<{ ok: boolean }>;
        transcriptFileName: string;
        rawJsonl: string;
      };
      expect(b.transcriptFileName).toBe(file);
      expect(b.lines.length).toBe(1);
      expect(b.lines[0].ok).toBe(true);
      expect(b.rawJsonl).toBe('{"type":"x","v":1}\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("GET /api/session returns 404 when no file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "osa-http-"));
    try {
      const q = `?root=${encodeURIComponent(dir)}`;
      const { status } = await fetchJson(
        `${base}/api/session/${encodeURIComponent(SID)}${q}`
      );
      expect(status).toBe(404);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
