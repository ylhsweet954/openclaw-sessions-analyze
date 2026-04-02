import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  classifySessionFileName,
  getDefaultSessionsRoot,
  loadSessionsIndex,
  listSessionFiles,
  parseSessionIdFromFileName,
  readJsonlLines,
  resolveSessionTranscriptPath,
  resolveSessionsRoot,
  sessionIdsEqual,
} from "../src/sessions.js";

const SID1 = "11111111-1111-1111-1111-111111111111";
const SID2 = "22222222-2222-2222-2222-222222222222";

describe("getDefaultSessionsRoot", () => {
  it("uses home and OpenClaw segments", () => {
    const r = getDefaultSessionsRoot();
    expect(r).toBe(
      path.join(os.homedir(), ".openclaw", "agents", "main", "sessions")
    );
  });
});

describe("resolveSessionsRoot", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "osa-sess-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("resolves existing directory from explicit path", async () => {
    const resolved = await resolveSessionsRoot(dir);
    expect(resolved).toBe(path.resolve(dir));
  });

  it("rejects missing path", async () => {
    const bad = path.join(dir, "nope");
    await expect(resolveSessionsRoot(bad)).rejects.toThrow(/not accessible/);
  });

  it("rejects a file path", async () => {
    const f = path.join(dir, "x.txt");
    await fs.writeFile(f, "x", "utf8");
    await expect(resolveSessionsRoot(f)).rejects.toThrow(/Not a directory/);
  });
});

describe("parseSessionIdFromFileName", () => {
  it("parses active jsonl", () => {
    expect(parseSessionIdFromFileName(`${SID1}.jsonl`)).toBe(SID1);
  });

  it("parses deleted variant", () => {
    const n = `${SID1}.jsonl.deleted.2026-01-01T00-00-00.000Z`;
    expect(parseSessionIdFromFileName(n)).toBe(SID1);
  });

  it("returns null for unrelated files", () => {
    expect(parseSessionIdFromFileName("foo.jsonl")).toBeNull();
    expect(parseSessionIdFromFileName(`${SID1}.txt`)).toBeNull();
  });
});

describe("classifySessionFileName", () => {
  it("classifies active, deleted, reset", () => {
    expect(classifySessionFileName(`${SID1}.jsonl`)).toBe("active");
    expect(
      classifySessionFileName(`${SID1}.jsonl.deleted.2026-01-01T00-00-00.000Z`)
    ).toBe("deleted");
    expect(
      classifySessionFileName(`${SID1}.jsonl.reset.2026-01-01T00-00-00.000Z`)
    ).toBe("reset");
  });
});

describe("sessionIdsEqual", () => {
  it("compares case-insensitively", () => {
    expect(sessionIdsEqual(SID1, SID1.toUpperCase())).toBe(true);
    expect(sessionIdsEqual(SID1, SID2)).toBe(false);
  });
});

describe("loadSessionsIndex", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "osa-sess-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns empty map when sessions.json missing", async () => {
    const m = await loadSessionsIndex(dir);
    expect(m.size).toBe(0);
  });

  it("merges entries by sessionId (case-insensitive key)", async () => {
    await fs.writeFile(
      path.join(dir, "sessions.json"),
      JSON.stringify({
        "agent:a": {
          sessionId: SID1,
          updatedAt: 100,
          lastChannel: "a",
        },
        "agent:b": {
          sessionId: SID1,
          updatedAt: 200,
          lastChannel: "b",
        },
      }),
      "utf8"
    );
    const m = await loadSessionsIndex(dir);
    expect(m.size).toBe(1);
    const e = m.get(SID1.toLowerCase());
    expect(e?.updatedAt).toBe(200);
    expect(e?.lastChannel).toBe("b");
  });
});

describe("listSessionFiles", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "osa-sess-"));
    await fs.writeFile(
      path.join(dir, "sessions.json"),
      JSON.stringify({
        x: {
          sessionId: SID1,
          updatedAt: 9_000_000_000_000,
          lastChannel: "qq",
        },
        y: {
          sessionId: SID2,
          updatedAt: 1_000_000_000_000,
        },
      }),
      "utf8"
    );
    await fs.writeFile(
      path.join(dir, `${SID1}.jsonl`),
      `{"type":"session","id":"${SID1}"}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(dir, `${SID2}.jsonl`),
      `{"type":"session","id":"${SID2}"}\n`,
      "utf8"
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lists and sorts by updatedAt desc", async () => {
    const index = await loadSessionsIndex(dir);
    const items = await listSessionFiles(dir, index);
    expect(items.length).toBe(2);
    expect(items[0].sessionId).toBe(SID1);
    expect(items[0].label).toBe("qq");
    expect(items[0].source).toBe("active");
  });
});

describe("resolveSessionTranscriptPath", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "osa-sess-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("prefers active over reset", async () => {
    await fs.writeFile(path.join(dir, `${SID1}.jsonl`), "{}", "utf8");
    await fs.writeFile(
      path.join(dir, `${SID1}.jsonl.reset.2026-01-01T00-00-00.000Z`),
      "{}",
      "utf8"
    );
    const p = await resolveSessionTranscriptPath(dir, SID1);
    expect(p).toBe(path.join(dir, `${SID1}.jsonl`));
  });

  it("uses newest reset when no active", async () => {
    const oldName = `${SID1}.jsonl.reset.2026-01-01T00-00-00.000Z`;
    const newName = `${SID1}.jsonl.reset.2026-02-01T00-00-00.000Z`;
    await fs.writeFile(path.join(dir, oldName), "{}", "utf8");
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(path.join(dir, newName), "{}", "utf8");
    const p = await resolveSessionTranscriptPath(dir, SID1);
    expect(p).toBe(path.join(dir, newName));
  });
});

describe("readJsonlLines", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "osa-sess-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("splits CRLF and parses lines", async () => {
    const f = path.join(dir, "t.jsonl");
    await fs.writeFile(f, '{"a":1}\r\n{"b":2}\n', "utf8");
    const { lines, totalLines, truncated } = await readJsonlLines(f);
    expect(totalLines).toBe(2);
    expect(truncated).toBe(false);
    expect(lines[0]).toMatchObject({ line: 1, ok: true, value: { a: 1 } });
    expect(lines[1]).toMatchObject({ line: 2, ok: true, value: { b: 2 } });
  });

  it("records parse errors per line", async () => {
    const f = path.join(dir, "bad.jsonl");
    await fs.writeFile(f, "not-json\n", "utf8");
    const { lines } = await readJsonlLines(f);
    expect(lines[0].ok).toBe(false);
    if (!lines[0].ok) {
      expect(lines[0].error).toBeDefined();
    }
  });

  it("truncates when exceeding maxLines", async () => {
    const f = path.join(dir, "many.jsonl");
    const body = Array.from({ length: 5 }, (_, i) => `{"n":${i}}`).join("\n");
    await fs.writeFile(f, body, "utf8");
    const { lines, truncated, totalLines } = await readJsonlLines(f, 3);
    expect(totalLines).toBe(5);
    expect(lines.length).toBe(3);
    expect(truncated).toBe(true);
  });
});
