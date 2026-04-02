import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const UUID =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl/i;

export const MAX_JSONL_LINES = 5000;

export function getDefaultSessionsRoot(): string {
  return path.join(os.homedir(), ".openclaw", "agents", "main", "sessions");
}

export async function resolveSessionsRoot(
  rootParam: string | null | undefined
): Promise<string> {
  const raw =
    rootParam === undefined || rootParam === null || rootParam.trim() === ""
      ? getDefaultSessionsRoot()
      : rootParam.trim();
  const resolved = path.resolve(raw);
  let st;
  try {
    st = await fs.stat(resolved);
  } catch (e) {
    const err = new Error(`Path is not accessible: ${resolved}`);
    (err as Error & { code?: string }).code = "ENOENT";
    throw err;
  }
  if (!st.isDirectory()) {
    const err = new Error(`Not a directory: ${resolved}`);
    (err as Error & { code?: string }).code = "ENOTDIR";
    throw err;
  }
  return resolved;
}

export type SessionMetaEntry = {
  sessionId: string;
  updatedAt?: number;
  lastChannel?: string;
  chatType?: string;
  sessionFile?: string;
  /** 会话展示名（若存在且非空，列表主标题优先使用） */
  label?: string;
  displayName?: string;
  [key: string]: unknown;
};

/** 非空字符串（trim 后）；否则 null */
export function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * 列表主标题：meta.label → meta.displayName → sessionId
 */
export function sessionListPrimaryTitle(
  meta: SessionMetaEntry | null,
  sessionId: string
): string {
  if (meta) {
    const m = meta as Record<string, unknown>;
    const fromLabel = nonEmptyString(m.label);
    if (fromLabel) return fromLabel;
    const fromDisplay = nonEmptyString(m.displayName);
    if (fromDisplay) return fromDisplay;
  }
  return sessionId;
}

/** Merge metadata from sessions.json (multiple keys may reference same sessionId). */
export async function loadSessionsIndex(
  sessionsDir: string
): Promise<Map<string, SessionMetaEntry>> {
  const map = new Map<string, SessionMetaEntry>();
  const jsonPath = path.join(sessionsDir, "sessions.json");
  let raw: string;
  try {
    raw = await fs.readFile(jsonPath, "utf8");
  } catch {
    return map;
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return map;
  }
  for (const entryKey of Object.keys(data)) {
    const v = data[entryKey];
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const sid = o.sessionId;
    if (typeof sid !== "string" || !sid) continue;
    const mapKey = sid.toLowerCase();
    const prev = map.get(mapKey) ?? { sessionId: sid };
    const merged: SessionMetaEntry = { ...prev, ...o, sessionId: sid };
    const u1 = prev.updatedAt;
    const u2 = o.updatedAt;
    if (typeof u2 === "number" && (u1 === undefined || u2 >= (u1 as number))) {
      merged.updatedAt = u2;
    }
    map.set(mapKey, merged);
  }
  return map;
}

export type SessionFileKind = "active" | "deleted" | "reset" | "other";

export function classifySessionFileName(fileName: string): SessionFileKind {
  const lower = fileName.toLowerCase();
  if (lower.includes(".jsonl.deleted.")) return "deleted";
  if (lower.includes(".jsonl.reset.")) return "reset";
  if (/\.jsonl$/i.test(fileName) && !/\.jsonl\./i.test(fileName))
    return "active";
  return "other";
}

export function parseSessionIdFromFileName(fileName: string): string | null {
  const m = fileName.match(UUID);
  return m ? m[1] : null;
}

export function sessionIdsEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export type SessionListItem = {
  sessionId: string;
  fileName: string;
  /** 副标题用：lastChannel / chatType 等 */
  label: string;
  /** 列表主标题：meta.label → meta.displayName → sessionId */
  listTitle: string;
  updatedAt: number | null;
  source: SessionFileKind;
  meta: SessionMetaEntry | null;
};

export async function listSessionFiles(
  sessionsDir: string,
  index: Map<string, SessionMetaEntry>
): Promise<SessionListItem[]> {
  const names = await fs.readdir(sessionsDir);
  const items: SessionListItem[] = [];
  for (const fileName of names) {
    const sid = parseSessionIdFromFileName(fileName);
    if (!sid) continue;
    const full = path.join(sessionsDir, fileName);
    let mtime: number | null = null;
    try {
      const st = await fs.stat(full);
      mtime = st.mtimeMs;
    } catch {
      /* skip */
    }
    const source = classifySessionFileName(fileName);
    const meta = index.get(sid.toLowerCase()) ?? null;
    const label =
      (meta?.lastChannel as string | undefined) ||
      (meta?.chatType as string | undefined) ||
      fileName;
    const updatedAt =
      typeof meta?.updatedAt === "number" ? meta.updatedAt : mtime;
    items.push({
      sessionId: sid,
      fileName,
      label: String(label),
      listTitle: sessionListPrimaryTitle(meta, sid),
      updatedAt: updatedAt != null ? Math.round(updatedAt) : null,
      source,
      meta,
    });
  }
  items.sort((a, b) => {
    const ta = a.updatedAt ?? 0;
    const tb = b.updatedAt ?? 0;
    return tb - ta;
  });
  return items;
}

export async function resolveSessionTranscriptPath(
  sessionsDir: string,
  sessionId: string
): Promise<string | null> {
  const names = await fs.readdir(sessionsDir);
  const matches: { name: string; kind: SessionFileKind; mtime: number }[] = [];
  for (const name of names) {
    const sid = parseSessionIdFromFileName(name);
    if (!sid || !sessionIdsEqual(sid, sessionId)) continue;
    const full = path.join(sessionsDir, name);
    let st;
    try {
      st = await fs.stat(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const kind = classifySessionFileName(name);
    if (kind === "other") continue;
    matches.push({ name, kind, mtime: st.mtimeMs });
  }
  if (matches.length === 0) return null;
  const active = matches.find((m) => m.kind === "active");
  if (active) return path.join(sessionsDir, active.name);
  matches.sort((a, b) => b.mtime - a.mtime);
  return path.join(sessionsDir, matches[0].name);
}

export type JsonlLine =
  | { line: number; ok: true; value: unknown }
  | { line: number; ok: false; raw: string; error: string };

export async function readJsonlLines(
  filePath: string,
  maxLines = MAX_JSONL_LINES
): Promise<{
  lines: JsonlLine[];
  truncated: boolean;
  totalLines: number;
  raw: string;
}> {
  const raw = await fs.readFile(filePath, "utf8");
  const parts = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const totalLines = parts.length;
  const slice = parts.slice(0, maxLines);
  const lines: JsonlLine[] = [];
  let n = 0;
  for (const line of slice) {
    n += 1;
    try {
      lines.push({ line: n, ok: true, value: JSON.parse(line) as unknown });
    } catch (e) {
      lines.push({
        line: n,
        ok: false,
        raw: line,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return {
    lines,
    truncated: totalLines > maxLines,
    totalLines,
    raw,
  };
}
