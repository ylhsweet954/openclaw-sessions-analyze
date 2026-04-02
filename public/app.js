(function () {
  const LS_KEY = "osa:sessionsRoot";

  const rootPath = document.getElementById("rootPath");
  const saveRoot = document.getElementById("saveRoot");
  const reloadList = document.getElementById("reloadList");
  const sessionList = document.getElementById("sessionList");
  const listHint = document.getElementById("listHint");
  const detailEmpty = document.getElementById("detailEmpty");
  const detailContent = document.getElementById("detailContent");
  const detailMeta = document.getElementById("detailMeta");
  const detailEvents = document.getElementById("detailEvents");

  /** @type {{ sessionId: string, fileName: string } | null} */
  let selected = null;

  function currentRoot() {
    return rootPath.value.trim();
  }

  async function fetchConfig() {
    const r = await fetch("/api/config");
    if (!r.ok) throw new Error("config failed");
    return r.json();
  }

  async function initRoot() {
    let stored = null;
    try {
      stored = localStorage.getItem(LS_KEY);
    } catch {
      /* */
    }
    const cfg = await fetchConfig();
    const def = cfg.defaultRoot || "";
    if (stored && stored.length > 0) {
      rootPath.value = stored;
    } else {
      rootPath.value = def;
    }
  }

  function badgeClass(source) {
    if (source === "active") return "badge badge-active";
    if (source === "deleted") return "badge badge-deleted";
    if (source === "reset") return "badge badge-reset";
    return "badge";
  }

  function renderList(sessions) {
    sessionList.innerHTML = "";
    if (!sessions.length) {
      listHint.textContent = "该目录下没有匹配的会话文件。";
      return;
    }
    listHint.textContent = sessions.length + " 个会话文件";
    for (const s of sessions) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "session-item";
      btn.dataset.sessionId = s.sessionId;
      btn.dataset.fileName = s.fileName;

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = s.fileName;

      const sub = document.createElement("div");
      sub.className = "sub";
      const parts = [];
      if (s.label && s.label !== s.fileName) parts.push(s.label);
      if (s.updatedAt != null)
        parts.push(
          "更新: " + new Date(s.updatedAt).toLocaleString()
        );
      sub.textContent = parts.join(" · ") || s.sessionId;

      const badge = document.createElement("span");
      badge.className = badgeClass(s.source);
      badge.textContent = s.source;
      name.appendChild(badge);

      btn.appendChild(name);
      btn.appendChild(sub);
      btn.addEventListener("click", () => selectSession(s.sessionId, s.fileName, btn));
      li.appendChild(btn);
      sessionList.appendChild(li);
    }
  }

  function setActiveButton(btn) {
    document.querySelectorAll(".session-item").forEach((el) => {
      el.classList.remove("active");
    });
    if (btn) btn.classList.add("active");
  }

  async function loadList() {
    listHint.textContent = "加载中…";
    sessionList.innerHTML = "";
    const root = currentRoot();
    const q = root ? "?root=" + encodeURIComponent(root) : "";
    const r = await fetch("/api/list" + q);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      listHint.textContent = "错误: " + (data.error || r.statusText);
      return;
    }
    rootPath.value = data.root || root;
    renderList(data.sessions || []);
  }

  function formatMessagePreview(msg) {
    if (!msg || typeof msg !== "object") return JSON.stringify(msg);
    const role = msg.role || "?";
    const content = msg.content;
    let text = "";
    if (Array.isArray(content)) {
      for (const c of content) {
        if (c && typeof c === "object" && c.type === "text" && c.text)
          text += c.text;
      }
    }
    const head = text.length > 400 ? text.slice(0, 400) + "…" : text;
    return role + ": " + (head || JSON.stringify(content));
  }

  function renderEvent(line) {
    const row = document.createElement("div");
    row.className = "event-row";

    if (!line.ok) {
      const t = document.createElement("div");
      t.className = "event-type";
      t.textContent = "行 " + line.line + " · 解析失败";
      const raw = document.createElement("div");
      raw.className = "event-raw";
      raw.textContent = line.error + "\n" + line.raw;
      row.appendChild(t);
      row.appendChild(raw);
      return row;
    }

    const v = line.value;
    const type = v && typeof v === "object" && v.type ? v.type : typeof v;

    const t = document.createElement("div");
    t.className = "event-type";
    t.textContent = "行 " + line.line + " · " + String(type);

    row.appendChild(t);

    if (v && typeof v === "object" && v.type === "message" && v.message) {
      const body = document.createElement("div");
      body.className = "event-body";
      body.textContent = formatMessagePreview(v.message);
      row.appendChild(body);
    } else {
      const pre = document.createElement("pre");
      pre.className = "event-raw";
      try {
        pre.textContent = JSON.stringify(v, null, 2);
      } catch {
        pre.textContent = String(v);
      }
      row.appendChild(pre);
    }

    return row;
  }

  async function selectSession(sessionId, fileName, btn) {
    selected = { sessionId, fileName };
    setActiveButton(btn);
    detailEmpty.classList.add("hidden");
    detailContent.classList.remove("hidden");
    detailMeta.textContent = "加载中…";
    detailEvents.innerHTML = "";

    const root = currentRoot();
    let url =
      "/api/session/" +
      encodeURIComponent(sessionId) +
      "?file=" +
      encodeURIComponent(fileName);
    if (root) url += "&root=" + encodeURIComponent(root);

    const r = await fetch(url);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      detailMeta.textContent = "";
      detailEvents.innerHTML =
        '<div class="err-banner">' +
        (data.error || r.statusText) +
        "</div>";
      return;
    }

    const metaBlock = document.createElement("pre");
    metaBlock.textContent = JSON.stringify(
      {
        transcriptFile: data.transcriptFileName,
        transcriptPath: data.transcriptPath,
        meta: data.meta,
      },
      null,
      2
    );
    detailMeta.innerHTML = "";
    detailMeta.appendChild(metaBlock);

    if (data.truncated) {
      const warn = document.createElement("div");
      warn.className = "err-banner";
      warn.textContent =
        "仅显示前 " +
        data.lines.length +
        " 行（共 " +
        data.totalLines +
        " 行）。";
      detailEvents.appendChild(warn);
    }

    for (const line of data.lines || []) {
      detailEvents.appendChild(renderEvent(line));
    }
  }

  saveRoot.addEventListener("click", () => {
    try {
      localStorage.setItem(LS_KEY, currentRoot());
    } catch {
      /* */
    }
    void loadList();
  });

  reloadList.addEventListener("click", () => {
    void loadList();
  });

  void (async function () {
    try {
      await initRoot();
      await loadList();
    } catch (e) {
      listHint.textContent =
        "初始化失败: " + (e && e.message ? e.message : String(e));
      rootPath.placeholder = "";
    }
  })();
})();
