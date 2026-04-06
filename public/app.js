(function () {
  const LS_KEY = "osa:sessionsRoot";
  const LS_SIDEBAR = "osa:sidebarCollapsed";

  const rootPath = document.getElementById("rootPath");
  const saveRoot = document.getElementById("saveRoot");
  const reloadList = document.getElementById("reloadList");
  const sessionList = document.getElementById("sessionList");
  const listHintText = document.getElementById("listHintText");
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const detailEmpty = document.getElementById("detailEmpty");
  const detailContent = document.getElementById("detailContent");
  const detailMeta = document.getElementById("detailMeta");
  const detailMetaBody = document.getElementById("detailMetaBody");
  const detailRawJsonl = document.getElementById("detailRawJsonl");
  const detailRawJsonlBody = document.getElementById("detailRawJsonlBody");
  const detailSummary = document.getElementById("detailSummary");
  const detailSummaryListTitle = document.getElementById("detailSummaryListTitle");
  const detailSummarySkills = document.getElementById("detailSummarySkills");
  const detailSummaryTools = document.getElementById("detailSummaryTools");
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
      listHintText.textContent = "该目录下没有匹配的会话文件。";
      return;
    }
    listHintText.textContent = sessions.length + " 个会话文件";
    for (const s of sessions) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "session-item";
      btn.dataset.sessionId = s.sessionId;
      btn.dataset.fileName = s.fileName;

      const name = document.createElement("div");
      name.className = "name";
      name.textContent =
        s.listTitle != null && String(s.listTitle).length > 0
          ? s.listTitle
          : s.fileName;

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
    listHintText.textContent = "加载中…";
    sessionList.innerHTML = "";
    const root = currentRoot();
    const q = root ? "?root=" + encodeURIComponent(root) : "";
    const r = await fetch("/api/list" + q);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      listHintText.textContent = "错误: " + (data.error || r.statusText);
      return;
    }
    rootPath.value = data.root || root;
    renderList(data.sessions || []);
  }

  function normalizeMessageRole(msg) {
    if (!msg || typeof msg !== "object") return "unknown";
    const r = msg.role;
    if (r == null || typeof r !== "string" || String(r).trim() === "")
      return "unknown";
    return String(r).trim().toLowerCase();
  }

  function roleVariantClass(role) {
    const known = ["user", "assistant", "system", "tool"];
    if (known.indexOf(role) >= 0) return "event-row--role-" + role;
    return "event-row--role-other";
  }

  function roleChipClass(role) {
    const known = ["user", "assistant", "system", "tool"];
    if (known.indexOf(role) >= 0)
      return "event-role-chip event-role-chip--" + role;
    return "event-role-chip event-role-chip--other";
  }

  function sortRoles(roles) {
    const order = ["user", "assistant", "system", "tool"];
    return roles.slice().sort(function (a, b) {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b);
    });
  }

  function applyRoleFilter() {
    const checked = new Set();
    detailEvents
      .querySelectorAll(".event-filters input[type=checkbox][data-role]")
      .forEach(function (cb) {
        if (cb.checked) checked.add(cb.dataset.role);
      });
    detailEvents.querySelectorAll(".event-row[data-message-role]").forEach(function (row) {
      const r = row.dataset.messageRole;
      row.classList.toggle("event-row--filtered-out", !checked.has(r));
    });
  }

  function buildRoleFilterBar(rolesSorted) {
    const wrap = document.createElement("div");
    wrap.className = "event-filters";
    if (!rolesSorted.length) return wrap;

    const label = document.createElement("span");
    label.className = "event-filters-label";
    label.textContent = "按 role 过滤 message：";
    wrap.appendChild(label);

    for (const role of rolesSorted) {
      const itemRow = document.createElement("div");
      itemRow.className = "event-filter-item-row";

      const lab = document.createElement("label");
      lab.className = "event-filter-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.dataset.role = role;
      const span = document.createElement("span");
      span.className = "event-filter-name " + roleChipClass(role);
      span.textContent = role;
      lab.appendChild(cb);
      lab.appendChild(span);
      cb.addEventListener("change", applyRoleFilter);

      const roleActions = document.createElement("span");
      roleActions.className = "event-filter-role-actions";

      const btnFold = document.createElement("button");
      btnFold.type = "button";
      btnFold.className = "btn-role-fold";
      btnFold.textContent = "折";
      btnFold.title = "折叠该 role 的全部 message";
      btnFold.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setMessageRowsExpandedForRole(role, false);
        btnFold.classList.add("btn-role-fold--active");
        btnUnfold.classList.remove("btn-role-fold--active");
      });

      const btnUnfold = document.createElement("button");
      btnUnfold.type = "button";
      btnUnfold.className = "btn-role-fold";
      btnUnfold.textContent = "展";
      btnUnfold.title = "展开该 role 的全部 message";
      btnUnfold.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setMessageRowsExpandedForRole(role, true);
        btnUnfold.classList.add("btn-role-fold--active");
        btnFold.classList.remove("btn-role-fold--active");
      });

      roleActions.appendChild(btnFold);
      roleActions.appendChild(btnUnfold);

      itemRow.appendChild(lab);
      itemRow.appendChild(roleActions);
      wrap.appendChild(itemRow);
    }
    return wrap;
  }

  function syncEventRowToggle(row) {
    const btn = row.querySelector(".event-row-toggle");
    if (!btn) return;
    const collapsed = row.classList.contains("event-row--collapsed");
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btn.textContent = collapsed ? "▶" : "▼";
  }

  /** 仅针对某一 message role 的行批量折叠或展开（含当前被过滤隐藏的行，切换显示后状态仍保留）。 */
  function setMessageRowsExpandedForRole(role, expand) {
    detailEvents
      .querySelectorAll(".event-row[data-message-role]")
      .forEach(function (row) {
        if (row.dataset.messageRole !== role) return;
        row.classList.toggle("event-row--collapsed", !expand);
        syncEventRowToggle(row);
      });
  }

  function setAllEventRowsExpanded(expand) {
    detailEvents.querySelectorAll(".event-row").forEach(function (row) {
      row.classList.toggle("event-row--collapsed", !expand);
      syncEventRowToggle(row);
    });
  }

  function buildEventsToolbar(rolesSorted) {
    const toolbar = document.createElement("div");
    toolbar.className = "event-toolbar";

    toolbar.appendChild(buildRoleFilterBar(rolesSorted));

    const actions = document.createElement("div");
    actions.className = "event-toolbar-actions";

    const btnExpand = document.createElement("button");
    btnExpand.type = "button";
    btnExpand.className = "btn btn-secondary btn-toolbar";
    btnExpand.textContent = "全部展开";
    btnExpand.addEventListener("click", function () {
      setAllEventRowsExpanded(true);
    });

    const btnCollapse = document.createElement("button");
    btnCollapse.type = "button";
    btnCollapse.className = "btn btn-secondary btn-toolbar";
    btnCollapse.textContent = "全部折叠";
    btnCollapse.addEventListener("click", function () {
      setAllEventRowsExpanded(false);
    });

    actions.appendChild(btnExpand);
    actions.appendChild(btnCollapse);

    const btnFs = document.createElement("button");
    btnFs.type = "button";
    btnFs.id = "detailEventsFullscreenBtn";
    btnFs.className = "btn btn-secondary btn-toolbar";
    btnFs.textContent = "全屏";
    btnFs.title = "全屏显示会话事件";
    btnFs.setAttribute("aria-pressed", "false");
    btnFs.addEventListener("click", function () {
      toggleDetailEventsFullscreen();
    });

    actions.appendChild(btnFs);
    toolbar.appendChild(actions);

    return toolbar;
  }

  function getFullscreenElement() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      null
    );
  }

  function requestFullscreenEl(el) {
    if (el.requestFullscreen) return el.requestFullscreen();
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    if (el.msRequestFullscreen) return el.msRequestFullscreen();
    return Promise.reject(new Error("no fullscreen"));
  }

  function exitFullscreenDoc() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    if (document.msExitFullscreen) return document.msExitFullscreen();
    return Promise.reject(new Error("no exit fullscreen"));
  }

  function syncDetailEventsFullscreenButton() {
    const btn = document.getElementById("detailEventsFullscreenBtn");
    if (!btn || !detailEvents) return;
    const inNative = getFullscreenElement() === detailEvents;
    const inOverlay = detailEvents.classList.contains("detail-events--overlay");
    const active = inNative || inOverlay;
    btn.textContent = active ? "退出全屏" : "全屏";
    btn.title = active ? "退出全屏" : "全屏显示会话事件";
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function teardownDetailEventsFullscreen() {
    if (detailEvents && getFullscreenElement() === detailEvents) {
      void exitFullscreenDoc().catch(function () {});
    }
    if (detailEvents) {
      detailEvents.classList.remove("detail-events--overlay");
    }
    document.body.style.overflow = "";
  }

  function toggleDetailEventsFullscreen() {
    if (!detailEvents) return;
    if (detailEvents.classList.contains("detail-events--overlay")) {
      teardownDetailEventsFullscreen();
      syncDetailEventsFullscreenButton();
      return;
    }
    if (getFullscreenElement() === detailEvents) {
      void exitFullscreenDoc().catch(function () {});
      return;
    }
    requestFullscreenEl(detailEvents)
      .then(function () {
        syncDetailEventsFullscreenButton();
      })
      .catch(function () {
        detailEvents.classList.add("detail-events--overlay");
        document.body.style.overflow = "hidden";
        syncDetailEventsFullscreenButton();
      });
  }

  let detailEventsToolbarResizeObserver = null;

  function teardownDetailEventsToolbarObserver() {
    if (detailEventsToolbarResizeObserver) {
      detailEventsToolbarResizeObserver.disconnect();
      detailEventsToolbarResizeObserver = null;
    }
    if (detailEvents) {
      detailEvents.style.removeProperty("--detail-events-sticky-top");
    }
  }

  function syncDetailEventsToolbarStickyOffset() {
    if (!detailEvents) return;
    const tb = detailEvents.querySelector(".event-toolbar");
    if (!tb) {
      detailEvents.style.removeProperty("--detail-events-sticky-top");
      return;
    }
    detailEvents.style.setProperty(
      "--detail-events-sticky-top",
      tb.offsetHeight + "px"
    );
  }

  function observeDetailEventsToolbar() {
    teardownDetailEventsToolbarObserver();
    const tb = detailEvents.querySelector(".event-toolbar");
    if (!tb) return;
    syncDetailEventsToolbarStickyOffset();
    detailEventsToolbarResizeObserver = new ResizeObserver(function () {
      syncDetailEventsToolbarStickyOffset();
    });
    detailEventsToolbarResizeObserver.observe(tb);
  }

  function initDetailEventsFullscreen() {
    function onFsChange() {
      syncDetailEventsFullscreenButton();
    }
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!detailEvents || !detailEvents.classList.contains("detail-events--overlay"))
        return;
      teardownDetailEventsFullscreen();
      syncDetailEventsFullscreenButton();
    });
  }

  /**
   * @param {{ defaultCollapsed?: boolean }} [opts]
   */
  function attachCollapsibleRow(row, typeEl, bodyEl, opts) {
    const defaultCollapsed = !!(opts && opts.defaultCollapsed);
    const header = document.createElement("div");
    header.className = "event-row-header";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "event-row-toggle";
    toggleBtn.setAttribute("aria-label", "展开或折叠本行详情");
    toggleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      row.classList.toggle("event-row--collapsed");
      syncEventRowToggle(row);
    });

    const typeWrap = document.createElement("div");
    typeWrap.className = "event-row-type-wrap";
    typeWrap.appendChild(typeEl);

    header.appendChild(toggleBtn);
    header.appendChild(typeWrap);

    const bodyWrap = document.createElement("div");
    bodyWrap.className = "event-row-body";
    bodyWrap.appendChild(bodyEl);

    row.appendChild(header);
    row.appendChild(bodyWrap);
    if (defaultCollapsed) row.classList.add("event-row--collapsed");
    syncEventRowToggle(row);
  }

  function sortNames(arr) {
    return arr.slice().sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function nonEmptyMetaString(v) {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  }

  /** 与左侧列表、服务端 sessionListPrimaryTitle 一致：label → displayName → sessionId */
  function sessionListPrimaryTitleFromMeta(meta, sessionId) {
    if (meta && typeof meta === "object") {
      const fromLabel = nonEmptyMetaString(meta.label);
      if (fromLabel) return fromLabel;
      const fromDisplay = nonEmptyMetaString(meta.displayName);
      if (fromDisplay) return fromDisplay;
    }
    return sessionId || "—";
  }

  /**
   * 从会话 meta 与 JSONL 解析行中收集技能名、工具名（去重后排序）。
   * 覆盖常见结构：content 块 type=toolCall/skill、OpenAI tool_calls、Anthropic tool_use、meta 中的 skills 等。
   */
  function extractSkillsAndTools(lines, meta) {
    const skills = new Set();
    const tools = new Set();

    function addSkill(name) {
      if (typeof name === "string" && name.trim()) skills.add(name.trim());
    }
    function addTool(name) {
      if (typeof name === "string" && name.trim()) tools.add(name.trim());
    }

    function addNamesFromObjectArray(arr, addFn) {
      if (!Array.isArray(arr)) return;
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (item && typeof item === "object" && typeof item.name === "string")
          addFn(item.name.trim());
      }
    }

    /**
     * OpenClaw 在 meta 或 session 行里存放 skillsSnapshot / systemPromptReport，
     * 技能、工具名在 { name } 条目中，而非 type=skill 的 content 块。
     */
    function extractOpenClawContextRoots(obj) {
      if (!obj || typeof obj !== "object") return;
      const snap = obj.skillsSnapshot;
      if (snap && typeof snap === "object") {
        addNamesFromObjectArray(snap.skills, addSkill);
        addNamesFromObjectArray(snap.resolvedSkills, addSkill);
      }
      const spr = obj.systemPromptReport;
      if (spr && typeof spr === "object") {
        if (
          spr.skills &&
          typeof spr.skills === "object" &&
          Array.isArray(spr.skills.entries)
        )
          addNamesFromObjectArray(spr.skills.entries, addSkill);
        if (
          spr.tools &&
          typeof spr.tools === "object" &&
          Array.isArray(spr.tools.entries)
        )
          addNamesFromObjectArray(spr.tools.entries, addTool);
      }
    }

    function walk(obj, depth) {
      if (obj == null || depth > 28) return;
      if (typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) walk(obj[i], depth + 1);
        return;
      }
      const t = obj.type;
      if (typeof t === "string") {
        if (t === "toolCall" && typeof obj.name === "string") addTool(obj.name);
        else if (t === "tool_use" && typeof obj.name === "string")
          addTool(obj.name);
        else if (t === "skill" && typeof obj.name === "string")
          addSkill(obj.name);
        else if (t === "skillCall" && typeof obj.name === "string")
          addSkill(obj.name);
      }
      if (Array.isArray(obj.tool_calls)) {
        for (let i = 0; i < obj.tool_calls.length; i++) {
          const tc = obj.tool_calls[i];
          if (
            tc &&
            typeof tc === "object" &&
            tc.function &&
            typeof tc.function.name === "string"
          )
            addTool(tc.function.name);
        }
      }
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) walk(obj[keys[i]], depth + 1);
    }

    if (meta && typeof meta === "object") {
      for (const key of ["skills", "activeSkills", "skillNames"]) {
        const v = meta[key];
        if (!Array.isArray(v)) continue;
        for (let i = 0; i < v.length; i++) {
          const item = v[i];
          if (typeof item === "string" && item.trim()) addSkill(item.trim());
          else if (
            item &&
            typeof item === "object" &&
            typeof item.name === "string"
          )
            addSkill(item.name.trim());
        }
      }
      extractOpenClawContextRoots(meta);
      walk(meta, 0);
    }

    for (let i = 0; i < (lines || []).length; i++) {
      const line = lines[i];
      if (!line.ok) continue;
      const val = line.value;
      if (val && typeof val === "object") extractOpenClawContextRoots(val);
      walk(val, 0);
    }

    return {
      skills: sortNames(Array.from(skills)),
      tools: sortNames(Array.from(tools)),
    };
  }

  function stringifyArgs(args) {
    if (args === undefined) return "";
    try {
      if (typeof args === "string") return args;
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  }

  /** 将 message.content 中单块格式化为可读文本（thinking / toolCall / text 等）。 */
  function formatMessageContentBlock(c) {
    if (!c || typeof c !== "object") return "";
    const t = c.type;
    if (t === "text" && typeof c.text === "string") return c.text;

    if (t === "thinking") {
      const th = typeof c.thinking === "string" ? c.thinking : "";
      return th ? "【思考 thinking】\n" + th : "";
    }

    if (t === "toolCall") {
      const name = c.name != null ? String(c.name) : "?";
      const argsStr = stringifyArgs(c.arguments);
      return (
        "【工具调用 toolCall】" +
        name +
        (argsStr ? "\n" + argsStr : "")
      );
    }

    if (t === "tool_result" || t === "toolResult") {
      const body = c.content !== undefined ? c.content : c.text;
      let inner = "";
      if (typeof body === "string") inner = body;
      else {
        try {
          inner = JSON.stringify(body, null, 2);
        } catch {
          inner = String(body);
        }
      }
      const tid = c.toolCallId != null ? String(c.toolCallId) : "";
      return (
        "【工具结果】" +
        (tid ? " id=" + tid + "\n" : "\n") +
        inner
      );
    }

    try {
      return "【" + String(t) + "】\n" + JSON.stringify(c, null, 2);
    } catch {
      return "【" + String(t) + "】";
    }
  }

  function formatMessagePreview(msg) {
    if (!msg || typeof msg !== "object") return JSON.stringify(msg);
    const role = msg.role || "?";
    const content = msg.content;
    const parts = [];

    if (Array.isArray(content)) {
      for (let i = 0; i < content.length; i++) {
        const s = formatMessageContentBlock(content[i]);
        if (s) parts.push(s);
      }
    } else if (typeof content === "string") {
      parts.push(content);
    }

    if (parts.length === 0) {
      try {
        return role + ":\n" + JSON.stringify(msg, null, 2);
      } catch {
        return role + ": " + String(msg);
      }
    }

    return role + ":\n\n" + parts.join("\n\n");
  }

  function numOrNull(v) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function parseTimeToMs(v) {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) {
      if (v > 1e12) return Math.round(v);
      if (v > 1e9) return Math.round(v * 1000);
      return Math.round(v);
    }
    if (typeof v === "string") {
      const d = Date.parse(v);
      if (!Number.isNaN(d)) return d;
    }
    return null;
  }

  function mergeUsageObject(u) {
    if (!u || typeof u !== "object") return { inT: null, outT: null };
    const inT = numOrNull(
      u.input_tokens ??
        u.prompt_tokens ??
        u.inputTokens ??
        u.promptTokens ??
        u.input ??
        u.cache_read_input_tokens ??
        u.promptTokenCount
    );
    const outT = numOrNull(
      u.output_tokens ??
        u.completion_tokens ??
        u.outputTokens ??
        u.completionTokens ??
        u.output ??
        u.candidatesTokenCount ??
        u.outputTokenCount
    );
    return { inT, outT };
  }

  /** 开始时间：message.timestamp（多为毫秒时间戳） */
  function getMessageStartMs(envelope) {
    const msg =
      envelope &&
      envelope.message &&
      typeof envelope.message === "object"
        ? envelope.message
        : null;
    if (!msg) return null;
    return parseTimeToMs(msg.timestamp);
  }

  /** 结束时间：JSONL 行级 timestamp（ISO，可含毫秒） */
  function getMessageEndMs(envelope) {
    const root = envelope && typeof envelope === "object" ? envelope : {};
    return parseTimeToMs(root.timestamp) || parseTimeToMs(root.ts);
  }

  function extractMessageLineMetrics(envelope) {
    const msg =
      envelope &&
      envelope.message &&
      typeof envelope.message === "object"
        ? envelope.message
        : null;
    const root = envelope && typeof envelope === "object" ? envelope : {};
    const meta =
      root.meta && typeof root.meta === "object" ? root.meta : null;

    function str(x) {
      if (typeof x === "string" && x.trim()) return x.trim();
      return null;
    }

    function pickModel() {
      return (
        str(msg && msg.model) ||
        str(root.model) ||
        str(msg && msg.modelId) ||
        str(root.modelId) ||
        str(msg && msg.modelName) ||
        str(meta && meta.model) ||
        null
      );
    }

    const usage =
      (msg && msg.usage) ||
      (msg && msg.usageMetadata) ||
      root.usage ||
      root.usageMetadata ||
      (meta && meta.usage) ||
      null;
    let { inT, outT } = mergeUsageObject(usage);

    if (inT == null && outT == null && msg && msg.usageMetadata) {
      const u2 = mergeUsageObject(msg.usageMetadata);
      inT = u2.inT;
      outT = u2.outT;
    }

    const startMs = getMessageStartMs(envelope);
    const endMs = getMessageEndMs(envelope);

    let durationMs =
      numOrNull(msg && msg.durationMs) ||
      numOrNull(root.durationMs);

    function normalizeLooseDuration(d) {
      if (d == null || !Number.isFinite(d) || d <= 0) return null;
      if (!Number.isInteger(d) && d < 86400000) return Math.round(d * 1000);
      if (Number.isInteger(d) && d > 0 && d < 1000) return d * 1000;
      return Math.round(d);
    }

    if (durationMs == null) {
      const d = numOrNull(msg && msg.duration) || numOrNull(root.duration);
      durationMs = normalizeLooseDuration(d);
    }

    if (durationMs == null && startMs != null && endMs != null) {
      durationMs = Math.abs(endMs - startMs);
    }

    return {
      model: pickModel(),
      inputTokens: inT,
      outputTokens: outT,
      startMs,
      endMs,
      durationMs,
    };
  }

  function getEffectiveDurationMs(metrics) {
    if (!metrics) return null;
    if (
      metrics.durationMs != null &&
      Number.isFinite(metrics.durationMs) &&
      metrics.durationMs >= 0
    )
      return metrics.durationMs;
    if (metrics.startMs != null && metrics.endMs != null)
      return Math.abs(metrics.endMs - metrics.startMs);
    return null;
  }

  /** 北京时间（Asia/Shanghai），含毫秒 */
  function formatTs(ms) {
    if (ms == null) return "—";
    const n = Number(ms);
    if (!Number.isFinite(n)) return "—";
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return "—";
    const frac = Math.floor(Math.abs(n) % 1000);
    const fracStr = String(frac).padStart(3, "0");
    let base;
    try {
      base = d.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return "—";
    }
    return base + "." + fracStr;
  }

  function formatDurationMs(ms) {
    if (ms == null || !Number.isFinite(ms)) return "—";
    if (ms < 1000) return Math.round(ms) + " ms";
    if (ms < 60000) return (ms / 1000).toFixed(1) + " s";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return h + " h " + (m % 60) + " min";
    if (m > 0) return m + " min " + (s % 60) + " s";
    return (ms / 1000).toFixed(1) + " s";
  }

  function formatMessageMetricsLine(metrics) {
    const tin =
      metrics.inputTokens != null ? String(metrics.inputTokens) : "—";
    const tout =
      metrics.outputTokens != null ? String(metrics.outputTokens) : "—";
    return [
      metrics.model || "—",
      "输入 " + tin,
      "输出 " + tout,
      "开始 " + formatTs(metrics.startMs),
      "结束 " + formatTs(metrics.endMs),
      "时长 " + formatDurationMs(getEffectiveDurationMs(metrics)),
    ].join(" | ");
  }

  function buildDurationBar(metrics, maxDur) {
    const track = document.createElement("div");
    track.className = "event-duration-bar-track";

    const dur = getEffectiveDurationMs(metrics);
    let pct = 0;
    let fillClass = "event-duration-bar-fill event-duration-bar-fill--none";

    if (dur != null && dur > 0) {
      pct =
        maxDur > 0 ? Math.min(100, (dur / maxDur) * 100) : 100;
      if (dur < 30000)
        fillClass = "event-duration-bar-fill event-duration-bar-fill--short";
      else if (dur < 60000)
        fillClass = "event-duration-bar-fill event-duration-bar-fill--mid";
      else fillClass = "event-duration-bar-fill event-duration-bar-fill--long";
      track.title =
        "时长 " +
        formatDurationMs(dur) +
        (maxDur > 0
          ? " · 占本会话最长 message 的 " + Math.round(pct) + "%"
          : "");
    } else {
      track.title =
        dur == null
          ? "无可用时长数据（无法绘制相对比例）"
          : "本会话无有效时长用于归一化";
    }

    const fill = document.createElement("div");
    fill.className = fillClass;
    fill.style.width = pct + "%";
    track.appendChild(fill);
    return track;
  }

  function buildRichMessageTypeHeader(lineNo, role, metrics, maxDur) {
    const wrap = document.createElement("div");
    wrap.className = "event-type event-type--message-rich";

    const line1 = document.createElement("div");
    line1.className = "event-type-line1";
    line1.appendChild(document.createTextNode("行 " + lineNo + " · message "));
    const chip = document.createElement("span");
    chip.className = roleChipClass(role);
    chip.textContent = role;
    line1.appendChild(chip);

    const line2 = document.createElement("div");
    line2.className = "event-type-meta-line";
    line2.textContent = formatMessageMetricsLine(metrics);

    const barCol = document.createElement("div");
    barCol.className = "event-type-duration-col";
    barCol.appendChild(buildDurationBar(metrics, maxDur));

    wrap.appendChild(line1);
    wrap.appendChild(line2);
    wrap.appendChild(barCol);
    return wrap;
  }

  function renderEvent(line, renderCtx) {
    renderCtx = renderCtx || {};
    const maxMsgDur = renderCtx.maxMessageDurationMs || 0;

    const row = document.createElement("div");
    row.className = "event-row";

    if (!line.ok) {
      const t = document.createElement("div");
      t.className = "event-type";
      t.textContent = "行 " + line.line + " · 解析失败";
      const raw = document.createElement("div");
      raw.className = "event-raw";
      raw.textContent = line.error + "\n" + line.raw;
      attachCollapsibleRow(row, t, raw, { defaultCollapsed: true });
      return row;
    }

    const v = line.value;
    const type = v && typeof v === "object" && v.type ? v.type : typeof v;

    let t;

    if (v && typeof v === "object" && v.type === "message" && v.message) {
      const role = normalizeMessageRole(v.message);
      row.dataset.messageRole = role;
      row.classList.add("event-row--message");
      row.classList.add(roleVariantClass(role));

      const metrics = extractMessageLineMetrics(v);
      t = buildRichMessageTypeHeader(line.line, role, metrics, maxMsgDur);
    } else {
      t = document.createElement("div");
      t.className = "event-type";
      t.textContent = "行 " + line.line + " · " + String(type);
    }

    let contentEl;
    if (v && typeof v === "object" && v.type === "message" && v.message) {
      const body = document.createElement("div");
      body.className = "event-body event-body--message";
      body.textContent = formatMessagePreview(v.message);
      contentEl = body;
    } else {
      const pre = document.createElement("pre");
      pre.className = "event-raw";
      try {
        pre.textContent = JSON.stringify(v, null, 2);
      } catch {
        pre.textContent = String(v);
      }
      contentEl = pre;
    }

    const isMessageRow =
      v && typeof v === "object" && v.type === "message" && v.message;
    attachCollapsibleRow(row, t, contentEl, {
      defaultCollapsed: !isMessageRow,
    });
    return row;
  }

  async function selectSession(sessionId, fileName, btn) {
    selected = { sessionId, fileName };
    setActiveButton(btn);
    detailEmpty.classList.add("hidden");
    detailContent.classList.remove("hidden");
    detailMeta.removeAttribute("open");
    detailRawJsonl.removeAttribute("open");
    detailSummary.removeAttribute("open");
    detailMetaBody.textContent = "加载中…";
    detailRawJsonlBody.textContent = "加载中…";
    detailSummaryListTitle.textContent = "加载中…";
    detailSummarySkills.textContent = "加载中…";
    detailSummaryTools.textContent = "加载中…";
    teardownDetailEventsFullscreen();
    teardownDetailEventsToolbarObserver();
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
      detailMetaBody.textContent = "";
      detailRawJsonlBody.textContent = "";
      detailSummaryListTitle.textContent = "—";
      detailSummarySkills.textContent = "—";
      detailSummaryTools.textContent = "—";
      teardownDetailEventsFullscreen();
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
    detailMetaBody.innerHTML = "";
    detailMetaBody.appendChild(metaBlock);

    const rawPre = document.createElement("pre");
    rawPre.textContent =
      typeof data.rawJsonl === "string" ? data.rawJsonl : "";
    detailRawJsonlBody.innerHTML = "";
    detailRawJsonlBody.appendChild(rawPre);

    detailSummaryListTitle.textContent = sessionListPrimaryTitleFromMeta(
      data.meta,
      data.sessionId || sessionId
    );

    const extracted = extractSkillsAndTools(data.lines || [], data.meta);
    detailSummarySkills.textContent = extracted.skills.length
      ? extracted.skills.join(", ")
      : "（无）";
    detailSummaryTools.textContent = extracted.tools.length
      ? extracted.tools.join(", ")
      : "（无）";

    const rolesSet = new Set();
    for (const line of data.lines || []) {
      if (!line.ok) continue;
      const val = line.value;
      if (
        val &&
        typeof val === "object" &&
        val.type === "message" &&
        val.message
      ) {
        rolesSet.add(normalizeMessageRole(val.message));
      }
    }
    detailEvents.appendChild(
      buildEventsToolbar(sortRoles(Array.from(rolesSet)))
    );
    observeDetailEventsToolbar();

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

    const lineArr = data.lines || [];
    let maxMessageDurationMs = 0;
    for (let i = 0; i < lineArr.length; i++) {
      const ln = lineArr[i];
      if (!ln.ok) continue;
      const val = ln.value;
      if (
        !val ||
        typeof val !== "object" ||
        val.type !== "message" ||
        !val.message
      )
        continue;
      const d = getEffectiveDurationMs(extractMessageLineMetrics(val));
      if (d != null && d > maxMessageDurationMs) maxMessageDurationMs = d;
    }

    const renderCtx = {
      maxMessageDurationMs: maxMessageDurationMs,
    };
    for (const line of lineArr) {
      detailEvents.appendChild(renderEvent(line, renderCtx));
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

  function initDetailMetaResize() {
    document.querySelectorAll(".detail-meta-panel").forEach(function (panel) {
      const scroll = panel.querySelector(".detail-meta-scroll");
      const handle = panel.querySelector(".detail-meta-resize-handle");
      if (!scroll || !handle) return;

      const def = parseInt(panel.dataset.defaultHeight || "200", 10);
      if (!scroll.style.height || scroll.style.height === "") {
        scroll.style.height = def + "px";
      }

      let startY = 0;
      let startH = 0;

      function minPx() {
        return parseInt(panel.dataset.minHeight || "80", 10);
      }
      function maxPx() {
        const vh = parseFloat(panel.dataset.maxHeightVh || "80");
        if (Number.isNaN(vh)) return window.innerHeight * 0.8;
        return (window.innerHeight * vh) / 100;
      }

      function onPointerMove(e) {
        e.preventDefault();
        const dy = e.clientY - startY;
        const next = Math.round(
          Math.min(maxPx(), Math.max(minPx(), startH + dy))
        );
        scroll.style.height = next + "px";
      }

      function onPointerUp(e) {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }

      handle.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        startY = e.clientY;
        startH = scroll.getBoundingClientRect().height;
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
        document.addEventListener("pointercancel", onPointerUp);
      });
    });
  }

  initDetailMetaResize();

  function applySidebarCollapsed(collapsed) {
    if (!sidebar || !sidebarToggle) return;
    sidebar.classList.toggle("sidebar--collapsed", collapsed);
    sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    sidebarToggle.title = collapsed ? "展开会话列表" : "折叠会话列表";
    const icon = sidebarToggle.querySelector(".sidebar-toggle-icon");
    if (icon) icon.textContent = collapsed ? "»" : "«";
    try {
      localStorage.setItem(LS_SIDEBAR, collapsed ? "1" : "0");
    } catch {
      /* */
    }
  }

  function initSidebarToggle() {
    if (!sidebar || !sidebarToggle) return;
    let collapsed = false;
    try {
      collapsed = localStorage.getItem(LS_SIDEBAR) === "1";
    } catch {
      /* */
    }
    applySidebarCollapsed(collapsed);
    sidebarToggle.addEventListener("click", function () {
      applySidebarCollapsed(!sidebar.classList.contains("sidebar--collapsed"));
    });
  }

  initSidebarToggle();
  initDetailEventsFullscreen();

  void (async function () {
    try {
      await initRoot();
      await loadList();
    } catch (e) {
      listHintText.textContent =
        "初始化失败: " + (e && e.message ? e.message : String(e));
      rootPath.placeholder = "";
    }
  })();
})();
