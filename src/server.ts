import * as http from "node:http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDefaultSessionsRoot,
  loadSessionsIndex,
  listSessionFiles,
  parseSessionIdFromFileName,
  readJsonlLines,
  resolveSessionsRoot,
  resolveSessionTranscriptPath,
  sessionIdsEqual,
  type SessionMetaEntry,
} from "./sessions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown
): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function slimMetaForList(m: SessionMetaEntry | null): Record<string, unknown> | null {
  if (!m) return null;
  return {
    sessionId: m.sessionId,
    updatedAt: m.updatedAt,
    lastChannel: m.lastChannel,
    chatType: m.chatType,
    sessionFile: m.sessionFile,
    deliveryContext: m.deliveryContext,
    origin: m.origin,
  };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

async function sendStatic(
  res: http.ServerResponse,
  relPath: string
): Promise<void> {
  const filePath = path.resolve(publicDir, relPath);
  const rel = path.relative(publicDir, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const ct = MIME[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": ct });
    res.end(buf);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

function parseRootParam(url: URL): string | undefined {
  const raw = url.searchParams.get("root");
  if (raw === null || raw === "") return undefined;
  return raw;
}

export async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (req.method !== "GET") {
    res.writeHead(405).end("Method Not Allowed");
    return;
  }

  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/config") {
    sendJson(res, 200, { defaultRoot: getDefaultSessionsRoot() });
    return;
  }

  if (url.pathname === "/api/list") {
    let sessionsDir: string;
    try {
      sessionsDir = await resolveSessionsRoot(parseRootParam(url));
    } catch (e) {
      sendJson(res, 400, {
        error: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    try {
      const index = await loadSessionsIndex(sessionsDir);
      const items = await listSessionFiles(sessionsDir, index);
      sendJson(res, 200, {
        root: sessionsDir,
        sessions: items.map((it) => ({
          ...it,
          meta: slimMetaForList(it.meta),
        })),
      });
    } catch (e) {
      sendJson(res, 500, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return;
  }

  const sessionMatch = /^\/api\/session\/([^/]+)$/.exec(url.pathname);
  if (sessionMatch) {
    let sessionId: string;
    try {
      sessionId = decodeURIComponent(sessionMatch[1]);
    } catch {
      sendJson(res, 400, { error: "Invalid session id" });
      return;
    }
    let sessionsDir: string;
    try {
      sessionsDir = await resolveSessionsRoot(parseRootParam(url));
    } catch (e) {
      sendJson(res, 400, {
        error: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    try {
      const index = await loadSessionsIndex(sessionsDir);
      const meta = index.get(sessionId.toLowerCase()) ?? null;
      const fileParam = url.searchParams.get("file");
      let transcriptPath: string | null = null;
      if (fileParam && fileParam.length > 0) {
        const base = path.basename(fileParam);
        if (base !== fileParam || base.includes("..")) {
          sendJson(res, 400, { error: "Invalid file parameter" });
          return;
        }
        const sidFromFile = parseSessionIdFromFileName(base);
        if (!sidFromFile || !sessionIdsEqual(sidFromFile, sessionId)) {
          sendJson(res, 400, { error: "File does not match session id" });
          return;
        }
        const candidate = path.join(sessionsDir, base);
        const rel = path.relative(sessionsDir, candidate);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          sendJson(res, 400, { error: "Invalid path" });
          return;
        }
        try {
          const st = await fs.stat(candidate);
          if (st.isFile()) transcriptPath = candidate;
        } catch {
          transcriptPath = null;
        }
      } else {
        transcriptPath = await resolveSessionTranscriptPath(
          sessionsDir,
          sessionId
        );
      }
      if (!transcriptPath) {
        sendJson(res, 404, { error: "Session transcript not found" });
        return;
      }
      const { lines, truncated, totalLines, raw } = await readJsonlLines(
        transcriptPath
      );
      sendJson(res, 200, {
        sessionId,
        root: sessionsDir,
        transcriptPath,
        transcriptFileName: path.basename(transcriptPath),
        meta,
        lines,
        truncated,
        totalLines,
        rawJsonl: raw,
      });
    } catch (e) {
      sendJson(res, 500, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return;
  }

  let staticPath = url.pathname;
  if (staticPath === "/") staticPath = "/index.html";
  staticPath = staticPath.replace(/^\/+/, "");
  await sendStatic(res, staticPath);
}

export function createHttpServer(): http.Server {
  return http.createServer((req, res) => {
    void handleRequest(req, res);
  });
}
