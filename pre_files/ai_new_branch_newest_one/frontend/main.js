const App = {
  user: null,
  workspace: null,
  providers: [],
  languages: {},
  promptModes: [],
  scaffold: { project_markdown: "", graph: {} },
  graph: { project_profile: {}, pcg: { nodes: [], edges: [] }, lkg: [], latest: {} },
  editor: null,
  diagnostics: [],
  dirty: false,
  streaming: false,
  authMode: "login",
  auth: { username: "", password: "", provider: "", apiKey: "", apiUrl: "" },
  authMsg: "",
  sidePanel: "tree",
  selectionMenu: { show: false, x: 0, y: 0 },
  selectedText: "",
  chatTimeout: null,
  scrollTimer: null,
  currentStreamingAssistant: null,
  _chatLockedToBottom: true,
  _streamingRenderTimer: null,
  attachedFiles: [],
  lkgManaging: false,
  lkgSelection: new Set(),
  lkgEditingName: null,
  lkgVizCy: null,
  lkgVizData: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\(branch\)/g, "<strong>$1</strong>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderMarkdownLite(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let codeLang = "";
  let codeLines = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function closeList() {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  }

  function openList(type) {
    flushParagraph();
    if (listType && listType !== type) closeList();
    if (!listType) {
      listType = type;
      html.push(`<${type}>`);
    }
  }

  function flushCode() {
    html.push(`<div class="code-block"><div class="code-actions"><button class="icon-btn copy-code-btn" title="复制">⧉</button><button class="icon-btn apply-code-btn" title="应用到代码区">→</button></div><pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeLines.join("\n"))}</code></pre></div>`);
    codeLines = [];
    codeLang = "";
  }

  lines.forEach((line) => {
    const codeFence = line.match(/^```([\w+-]*)\s*$/);
    if (codeFence) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        closeList();
        inCode = true;
        codeLang = codeFence[1] || "";
      }
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      return;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      return;
    }

    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      closeList();
      html.push("<hr>");
      return;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      return;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (unordered) {
      openList("ul");
      html.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);
      return;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      openList("ol");
      html.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
      return;
    }

    closeList();
    paragraph.push(line.trim());
  });

  if (inCode) flushCode();
  flushParagraph();
  closeList();
  return html.join("");
}

function cleanAssistantContent(content) {
  const text = String(content || "");
  if (
    text.includes("model_not_found") ||
    text.includes("request_id") ||
    text.includes("does not exist or you do not have access") ||
    text.includes("invalid_request_error") ||
    /^API\s*(调用失败|request failed)/i.test(text)
  ) {
    return "API 调用失败，请检查模型名称或 API 配置。";
  }
  return text;
}

const renderCache = new WeakMap();

function extractReplyFromJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("`")) return null;
  let jsonText = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!jsonText.startsWith("{")) return null;
  try {
    const data = JSON.parse(jsonText);
    const reply = data.reply || data["回复"];
    if (reply && typeof reply === "string") return reply;
  } catch (err) {
    const match = jsonText.match(/"reply"\s*:\s*"([\s\S]*?)"\s*,/);
    if (match) {
      return unescapeText(match[1]);
    }
  }
  return null;
}

function unescapeText(text) {
  return String(text || "")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "")
    .replace(/\\\\/g, "\\");
}

function ensureUnescaped(msg) {
  if (!msg || msg._unescaped) return;
  msg.content = unescapeText(msg.content);
  msg._unescaped = true;
}

function renderMessage(msg) {
  ensureUnescaped(msg);
  let content = msg.content || "";
  if (msg.role === "assistant") {
    content = cleanAssistantContent(content);
    const jsonReply = extractReplyFromJson(content);
    if (jsonReply) content = jsonReply;
  } else if (msg.role === "user" && content.includes("【当前代码】")) {
    content = content.split("【当前代码】")[0].trim();
  }
  const cacheKey = content + (msg._streaming ? "|s" : "|n");
  let cached = renderCache.get(msg);
  if (cached && cached.key === cacheKey) return cached.html;
  let html;
  if (msg._streaming && msg.role === "assistant") {
    html = escapeHtml(content).replace(/\n/g, "<br>");
  } else {
    html = renderMarkdownLite(content);
  }
  renderCache.set(msg, { key: cacheKey, html });
  return html;
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body == null ? "GET" : "POST",
    headers: body == null ? {} : { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

function currentNode() {
  if (!App.workspace || !App.workspace.nodes) return null;
  return App.workspace.nodes[App.workspace.current_node_id];
}

function sortedTreeIds() {
  if (!App.workspace || !App.workspace.nodes) return [];
  const nodes = App.workspace.nodes;
  const root = Object.values(nodes).find((node) => !node.parent_id) || Object.values(nodes)[0];
  const ids = [];
  function walk(id, level) {
    const node = nodes[id];
    if (!node || node.archived) return;
    ids.push([id, level]);
    (node.children || []).forEach((child) => walk(child, level + 1));
  }
  if (root) walk(root.id, 0);
  return ids;
}

function visibleMessages() {
  const node = currentNode();
  if (!node || !node.messages) return [];
  return node.messages.filter((msg) => ["user", "assistant"].includes(msg.role));
}

function fileName() {
  const lang = App.languages[App.workspace?.editor_language] || App.languages.python;
  return `solution.${lang?.ext || "txt"}`;
}

function statusLang() {
  const lang = App.languages[App.workspace?.editor_language] || App.languages.python;
  return lang?.label || App.workspace?.editor_language || "Python";
}

function graphItems() {
  const graph = App.graph || {};
  const items = [];
  const profile = graph.project_profile || {};
  if (profile.goal) items.push({ name: "项目目标", description: profile.goal });
  const pcgNodes = graph.pcg?.nodes || [];
  if (pcgNodes.length) items.push({ name: "项目能力节点", description: `${pcgNodes.length} 个节点` });
  const lkg = graph.lkg || [];
  lkg.slice(0, 12).forEach((point) => {
    const weight = point.weight == null ? "" : ` · 熟悉度 ${point.weight}`;
    items.push({ name: point.name, description: `${point.description || point.evidence || "内部知识节点"}${weight}` });
  });
  return items;
}

function setDirty(value) {
  App.dirty = value;
}

async function saveWorkspace() {
  if (!App.workspace) return;
  if (App.editor && currentNode()) currentNode().code = App.editor.getValue();
  try {
    const data = await api("/api/workspace", { workspace: App.workspace });
    App.workspace = data.workspace;
    setDirty(false);
    updateTree();
  } catch (err) {
    App.authMsg = err.message;
    showAuthMessage();
  }
}

function saveWorkspaceInBackground() {
  if (!App.workspace) return;
  if (App.editor && currentNode()) currentNode().code = App.editor.getValue();
  const payload = JSON.stringify({ workspace: App.workspace });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/workspace", new Blob([payload], { type: "application/json" }));
    return;
  }
  fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

async function boot() {
  const cfg = await api("/api/config");
  App.user = cfg.user;
  App.providers = cfg.providers || [];
  App.languages = cfg.languages || {};
  App.promptModes = cfg.prompt_modes || [];
  App.auth.provider = App.providers.includes("deepseek") ? "deepseek" : (App.providers[0] || "");
  initAuthProviders();
  if (!App.user) {
    setAuthMode("login");
    showLoginView();
    return;
  }
  App.workspace = cfg.workspace;
  await refreshScaffold();
  showWorkspaceView();
  await initEditor();
  updateUI();
  resizeChatInput();
}

async function refreshScaffold() {
  if (!App.user) return;
  try {
    App.scaffold = await api("/api/scaffold");
    App.graph = App.scaffold.graph || { project_profile: {}, pcg: { nodes: [], edges: [] }, lkg: [], latest: {} };
  } catch (err) {
    App.scaffold = { project_markdown: "", graph: {} };
    App.graph = { project_profile: {}, pcg: { nodes: [], edges: [] }, lkg: [], latest: {} };
  }
}

async function refreshGraph() {
  if (!App.user) return;
  try {
    App.graph = await api("/api/graph");
  } catch (err) {
    App.graph = { project_profile: {}, pcg: { nodes: [], edges: [] }, lkg: [], latest: {} };
  }
}

function initEditor() {
  return new Promise((resolve) => {
    window.require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" } });
    window.require(["vs/editor/editor.main"], () => {
      const lang = App.languages[App.workspace?.editor_language] || App.languages?.python;
      App.editor = monaco.editor.create($("#editor"), {
        value: currentNode()?.code || "",
        language: lang?.monaco || "python",
        theme: "vs",
        automaticLayout: true,
        fontSize: 14,
        lineHeight: 21,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 4,
      });
      App.editor.onDidChangeModelContent(() => {
        const node = currentNode();
        if (node) {
          node.code = App.editor.getValue();
          setDirty(true);
        }
      });
      App.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveWorkspace());
      resolve();
    });
  });
}

function loadCurrentNodeIntoEditor() {
  if (!App.editor) return;
  const node = currentNode();
  if (!node) return;
  const lang = App.languages[App.workspace?.editor_language] || App.languages?.python;
  App.editor.setValue(node.code || "");
  monaco.editor.setModelLanguage(App.editor.getModel(), lang?.monaco || "python");
  setDirty(false);
  applyDiagnostics([]);
}

function applyDiagnostics(diagnostics) {
  App.diagnostics = diagnostics || [];
  if (!App.editor || !window.monaco) return;
  const model = App.editor.getModel();
  const markers = App.diagnostics.map((d) => ({
    startLineNumber: d.line || 1,
    startColumn: d.col || 1,
    endLineNumber: d.line || 1,
    endColumn: 200,
    message: d.message || "",
    severity: monaco.MarkerSeverity.Error,
  }));
  monaco.editor.setModelMarkers(model, "syntax", markers);
}

function showLoginView() {
  $("#login-view").classList.remove("hidden");
  $("#workspace-view").classList.add("hidden");
}

function showWorkspaceView() {
  $("#login-view").classList.add("hidden");
  $("#workspace-view").classList.remove("hidden");
}

function initAuthProviders() {
  const sel = $("#auth-provider");
  sel.innerHTML = App.providers.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
  if (App.providers.includes(App.auth.provider)) sel.value = App.auth.provider;
  else if (App.providers.length) sel.value = App.providers[0];
}

function setAuthMode(mode) {
  App.authMode = mode;
  $("#auth-tab-login").classList.toggle("active", mode === "login");
  $("#auth-tab-register").classList.toggle("active", mode === "register");
  const registerOnly = mode === "register";
  $("#auth-provider-wrap").classList.toggle("hidden", !registerOnly);
  $("#auth-apikey-wrap").classList.toggle("hidden", !registerOnly);
  $("#auth-apiurl-wrap").classList.toggle("hidden", !registerOnly);
  $("#auth-submit").textContent = registerOnly ? "注册并登录" : "登录";
}

function showAuthMessage() {
  $("#auth-message").textContent = App.authMsg || "";
}

function updateAccount() {
  if (!App.user) return;
  $("#account-username").textContent = App.user.username || "";
  $("#account-meta").textContent = `${App.user.profile || "用户"} · ${App.user.api_provider || ""}`;
}

function updateTree() {
  const list = $("#tree-list");
  const ids = sortedTreeIds();
  if (!ids.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = ids.map(([id, level]) => {
    const node = App.workspace.nodes[id];
    const isCurrent = id === App.workspace.current_node_id;
    const indent = "　".repeat(level);
    const icon = isCurrent ? "📍" : "📁";
    const delBtn = node.parent_id && !isCurrent
      ? `<button class="tree-del-btn" data-id="${escapeHtml(id)}" title="删除节点">×</button>`
      : "";
    return `<div class="tree-row">
      <button class="tree-node${isCurrent ? " active" : ""}" data-id="${escapeHtml(id)}">${indent}${icon} ${escapeHtml(node.title || "对话")}</button>
      ${delBtn}
    </div>`;
  }).join("");
}

function createMessageElement(msg) {
  const el = document.createElement("div");
  el.className = `msg ${msg.role}`;
  const roleLabel = msg.role === "user" ? "你" : "AI";
  el.innerHTML = `<div class="role">${roleLabel}</div><div class="md-content"></div>`;
  const contentEl = el.querySelector(".md-content");
  contentEl.innerHTML = renderMessage(msg);
  return el;
}

function renderChatList() {
  const list = $("#chat-list");
  const msgs = visibleMessages();
  list.innerHTML = "";
  msgs.forEach((msg) => list.appendChild(createMessageElement(msg)));
  smartScrollChatToBottom();
}

function updateChat() {
  // 流式过程中不整体重绘，由 appendStreamingMessage / handleSseEvent 直接操作 DOM
  if (App.streaming) return;
  renderChatList();
}

function isChatNearBottom(threshold = 60) {
  const list = $("#chat-list");
  if (!list) return true;
  return list.scrollHeight - list.scrollTop - list.clientHeight <= threshold;
}

function scrollChatToBottom() {
  const list = $("#chat-list");
  if (list) list.scrollTop = list.scrollHeight;
}

function smartScrollChatToBottom() {
  if (App._chatLockedToBottom) scrollChatToBottom();
}

function requestScrollChat() {
  if (App.scrollTimer) return;
  App.scrollTimer = setTimeout(() => {
    App.scrollTimer = null;
    smartScrollChatToBottom();
  }, 80);
}

function resizeChatInput() {
  const el = $("#chat-input");
  if (!el) return;
  el.style.height = "auto";
  const maxHeight = 200;
  const preferred = Math.min(el.scrollHeight, maxHeight);
  el.style.height = preferred + "px";
}

function updateProjectPanel() {
  const plan = String(App.scaffold?.project_markdown || "");
  const planEl = $("#project-plan");
  if (!plan.trim()) {
    planEl.textContent = "暂无项目规划";
    planEl.classList.add("muted");
    planEl.innerHTML = "暂无项目规划";
  } else {
    planEl.classList.remove("muted");
    planEl.innerHTML = renderMarkdownLite(plan);
  }
  const items = graphItems();
  const list = $("#knowledge-list");
  if (!items.length) {
    list.innerHTML = `<span class="muted">暂无内部图谱</span>`;
  } else {
    list.innerHTML = items.map((item) => `<div class="knowledge-item">
      <strong>${escapeHtml(item.name)}</strong><br>
      <span>${escapeHtml(item.description)}</span>
    </div>`).join("");
  }
  if (App.lkgManaging) renderLkgEditList();
}

function updateLkgManager() {
  const manager = $("#lkg-manager");
  const list = $("#knowledge-list");
  if (App.lkgManaging) {
    manager.classList.remove("hidden");
    list.classList.add("hidden");
    renderLkgEditList();
  } else {
    manager.classList.add("hidden");
    list.classList.remove("hidden");
  }
}

function renderLkgEditList() {
  const container = $("#lkg-edit-list");
  const lkg = App.graph?.lkg || [];
  if (!lkg.length) {
    container.innerHTML = `<span class="muted">暂无内部图谱，点击“添加”新建。</span>`;
    return;
  }
  container.innerHTML = lkg.map((item) => {
    const name = item.name || "";
    const desc = item.description || item.evidence || "";
    const weight = item.weight == null ? "" : item.weight;
    const isEditing = App.lkgEditingName === name;
    const selected = App.lkgSelection.has(name);
    if (isEditing) {
      return `<div class="lkg-item editing" data-name="${escapeHtml(name)}">
        <div class="lkg-edit-row">
          <input type="text" class="lkg-edit-name" value="${escapeHtml(name)}" placeholder="知识点名称" />
          <input type="text" class="lkg-edit-desc" value="${escapeHtml(desc)}" placeholder="描述" />
          <input type="number" class="lkg-edit-weight" value="${weight}" placeholder="熟悉度" step="0.1" min="0" max="1" />
          <div class="lkg-edit-actions">
            <button type="button" class="lkg-edit-save" data-name="${escapeHtml(name)}">保存</button>
            <button type="button" class="lkg-edit-cancel">取消</button>
          </div>
        </div>
      </div>`;
    }
    return `<div class="lkg-item" data-name="${escapeHtml(name)}">
      <input type="checkbox" class="lkg-checkbox" data-name="${escapeHtml(name)}" ${selected ? "checked" : ""} />
      <div class="lkg-item-main">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(desc)}${weight !== "" ? ` · 熟悉度 ${weight}` : ""}</span>
      </div>
      <div class="lkg-item-actions">
        <button type="button" class="lkg-edit-btn" data-name="${escapeHtml(name)}" title="编辑">✎</button>
        <button type="button" class="lkg-delete-btn" data-name="${escapeHtml(name)}" title="删除">×</button>
      </div>
    </div>`;
  }).join("");
}

async function saveLkgNode(node, oldKey) {
  const data = await api("/api/graph", { action: "save_node", section: "lkg", node, old_key: oldKey || undefined });
  App.graph = data.graph;
  updateProjectPanel();
  if (App.lkgManaging) renderLkgEditList();
}

async function deleteLkgNode(name) {
  if (!confirm(`确定删除知识点「${name}」？`)) return;
  const data = await api("/api/graph", { action: "delete_node", section: "lkg", key: name });
  App.graph = data.graph;
  App.lkgSelection.delete(name);
  updateProjectPanel();
  if (App.lkgManaging) renderLkgEditList();
}

async function batchDeleteLkgNodes() {
  const names = Array.from(App.lkgSelection);
  if (!names.length) {
    alert("请先勾选要删除的知识点");
    return;
  }
  if (!confirm(`确定删除选中的 ${names.length} 个知识点？`)) return;
  for (const name of names) {
    try {
      const data = await api("/api/graph", { action: "delete_node", section: "lkg", key: name });
      App.graph = data.graph;
      App.lkgSelection.delete(name);
    } catch (err) {
      alert(`删除「${name}」失败：${err.message}`);
    }
  }
  updateProjectPanel();
  if (App.lkgManaging) renderLkgEditList();
}

function openLkgForm() {
  $("#lkg-form").classList.remove("hidden");
  $("#lkg-name").value = "";
  $("#lkg-desc").value = "";
  $("#lkg-weight").value = "";
  $("#lkg-name").focus();
}

function closeLkgForm() {
  $("#lkg-form").classList.add("hidden");
  App.lkgEditingName = null;
}

async function onLkgFormSubmit(event) {
  event.preventDefault();
  const name = $("#lkg-name").value.trim();
  const description = $("#lkg-desc").value.trim();
  const weightInput = $("#lkg-weight").value.trim();
  if (!name) {
    alert("请输入知识点名称");
    return;
  }
  const node = { name, description };
  if (weightInput) {
    const weight = parseFloat(weightInput);
    if (!isNaN(weight)) node.weight = weight;
  }
  const oldKey = App.lkgEditingName || undefined;
  await saveLkgNode(node, oldKey);
  closeLkgForm();
}

function onLkgListClick(event) {
  const checkbox = event.target.closest(".lkg-checkbox");
  if (checkbox) {
    const name = checkbox.dataset.name;
    if (checkbox.checked) App.lkgSelection.add(name);
    else App.lkgSelection.delete(name);
    return;
  }
  const editBtn = event.target.closest(".lkg-edit-btn");
  if (editBtn) {
    App.lkgEditingName = editBtn.dataset.name;
    renderLkgEditList();
    return;
  }
  const deleteBtn = event.target.closest(".lkg-delete-btn");
  if (deleteBtn) {
    deleteLkgNode(deleteBtn.dataset.name);
    return;
  }
  const editSave = event.target.closest(".lkg-edit-save");
  if (editSave) {
    const itemEl = editSave.closest(".lkg-item");
    const name = itemEl.querySelector(".lkg-edit-name").value.trim();
    const description = itemEl.querySelector(".lkg-edit-desc").value.trim();
    const weightInput = itemEl.querySelector(".lkg-edit-weight").value.trim();
    if (!name) {
      alert("请输入知识点名称");
      return;
    }
    const node = { name, description };
    if (weightInput) {
      const weight = parseFloat(weightInput);
      if (!isNaN(weight)) node.weight = weight;
    }
    saveLkgNode(node, editSave.dataset.name);
    return;
  }
  const editCancel = event.target.closest(".lkg-edit-cancel");
  if (editCancel) {
    App.lkgEditingName = null;
    renderLkgEditList();
  }
}

/* ===== LKG 可视化 ===== */

async function openLkgVisualization() {
  const modal = $("#lkg-viz-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  showLkgVizPlaceholder("加载中…");
  try {
    const data = await fetch("/api/lkg-visualization").then((r) => {
      if (!r.ok) throw new Error("加载失败");
      return r.json();
    });
    App.lkgVizData = data;
    renderLkgVisualization(data);
  } catch (err) {
    showLkgVizPlaceholder("加载图谱失败：" + err.message);
  }
}

function closeLkgVisualization() {
  const modal = $("#lkg-viz-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.style.overflow = "";
  if (App.lkgVizCy) {
    App.lkgVizCy.destroy();
    App.lkgVizCy = null;
  }
  App.lkgVizData = null;
}

function showLkgVizPlaceholder(text) {
  const sidebar = $("#lkg-viz-sidebar");
  if (sidebar) sidebar.innerHTML = `<div class="viz-placeholder">${escapeHtml(text)}</div>`;
}

function nodeColorByGroup(group) {
  if (group === "mastered") return "#22c55e";
  if (group === "familiar") return "#3b82f6";
  return "#f97316";
}

function renderLkgVisualization(data) {
  const container = $("#lkg-viz-cy");
  if (!container || typeof cytoscape === "undefined") {
    showLkgVizPlaceholder("可视化库未加载");
    return;
  }
  if (App.lkgVizCy) {
    App.lkgVizCy.destroy();
    App.lkgVizCy = null;
  }
  if (!data.nodes || !data.nodes.length) {
    container.innerHTML = '';
    showLkgVizPlaceholder("暂无内部图谱数据");
    return;
  }

  showLkgVizPlaceholder("点击节点查看详情");
  const elements = [];
  data.nodes.forEach((n) => {
    elements.push({
      data: {
        id: n.id,
        label: n.label,
        description: n.description || "",
        weight: typeof n.weight === "number" ? n.weight : 0.5,
        evidence: n.evidence || "",
        group: n.group || "learning",
      },
    });
  });
  (data.edges || []).forEach((e) => {
    elements.push({
      data: {
        source: e.source,
        target: e.target,
        type: e.type || "implicit",
      },
    });
  });

  App.lkgVizCy = cytoscape({
    container,
    elements,
    minZoom: 0.2,
    maxZoom: 3,
    wheelSensitivity: 0.25,
    layout: {
      name: "cose",
      padding: 36,
      nodeRepulsion: 20000,
      idealEdgeLength: 140,
      edgeElasticity: 300,
      nestingFactor: 5,
      gravity: 0.5,
      numIter: 1500,
      initialTemp: 200,
      coolingFactor: 0.95,
      minTemp: 1,
      animate: true,
      animationDuration: 600,
      fit: true,
    },
    style: [
      {
        selector: "node",
        style: {
          label: "data(label)",
          width: (ele) => 24 + (ele.data("weight") || 0.5) * 32,
          height: (ele) => 24 + (ele.data("weight") || 0.5) * 32,
          "background-color": (ele) => nodeColorByGroup(ele.data("group")),
          "border-width": 2,
          "border-color": "#fff",
          "border-opacity": 1,
          color: "#202631",
          "font-size": 12,
          "font-weight": 600,
          "text-valign": "bottom",
          "text-halign": "center",
          "text-margin-y": 6,
          "text-background-color": "rgba(255,255,255,0.85)",
          "text-background-opacity": 1,
          "text-background-padding": "2px 5px",
          "text-background-shape": "roundrectangle",
          "overlay-padding": 6,
        },
      },
      {
        selector: "edge",
        style: {
          width: 1.5,
          "line-color": (ele) => (ele.data("type") === "related" ? "#3b82f6" : "#94a3b8"),
          "target-arrow-color": (ele) => (ele.data("type") === "related" ? "#3b82f6" : "#94a3b8"),
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "arrow-scale": 0.8,
        },
      },
      {
        selector: ":selected",
        style: {
          "border-width": 4,
          "border-color": "#f59e0b",
        },
      },
    ],
  });

  App.lkgVizCy.on("tap", "node", (evt) => {
    const node = evt.target;
    App.lkgVizCy.elements().unselect();
    node.select();
    showNodeDetail(node.data());
  });

  App.lkgVizCy.on("tap", (evt) => {
    if (evt.target === App.lkgVizCy) {
      App.lkgVizCy.elements().unselect();
      showLkgVizPlaceholder("点击节点查看详情");
    }
  });

  setTimeout(() => {
    if (App.lkgVizCy) App.lkgVizCy.fit(undefined, 24);
  }, 100);
}

function showNodeDetail(data) {
  const sidebar = $("#lkg-viz-sidebar");
  if (!sidebar) return;
  const groupLabels = { mastered: "已掌握", familiar: "熟悉", learning: "学习中" };
  const weightPercent = Math.round((data.weight || 0) * 100);
  const evidenceItems = data.evidence
    ? data.evidence.split(/\n|\r/).filter((s) => s.trim()).map((s) => escapeHtml(s.trim()))
    : [];
  sidebar.innerHTML = `<div class="viz-detail">
    <h4>${escapeHtml(data.label)}</h4>
    <div class="viz-meta">
      <span class="viz-badge ${escapeHtml(data.group)}">${escapeHtml(groupLabels[data.group] || "未知")}</span>
      <span class="viz-badge familiar">熟悉度 ${weightPercent}%</span>
    </div>
    <div class="viz-section">
      <strong>描述</strong>
      <p>${escapeHtml(data.description) || "暂无描述"}</p>
    </div>
    ${evidenceItems.length ? `<div class="viz-section"><strong>掌握证据</strong><ul>${evidenceItems.map((s) => `<li>${s}</li>`).join("")}</ul></div>` : ""}
  </div>`;
}

function fitLkgVisualization() {
  if (App.lkgVizCy) App.lkgVizCy.fit(undefined, 24);
}

function resetLkgVisualization() {
  if (!App.lkgVizCy || !App.lkgVizData) return;
  renderLkgVisualization(App.lkgVizData);
}

function updateSettings() {
  const promptSel = $("#setting-prompt-mode");
  promptSel.innerHTML = App.promptModes.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if (App.workspace) promptSel.value = App.workspace.prompt_mode || "";

  const modelSel = $("#setting-model");
  const models = App.user?.models || ["deepseek-chat"];
  modelSel.innerHTML = models.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if (App.workspace) modelSel.value = App.workspace.selected_model || "";

  const langSel = $("#setting-language");
  langSel.innerHTML = Object.entries(App.languages).map(([value, info]) =>
    `<option value="${escapeHtml(value)}">${escapeHtml(info.label)}</option>`
  ).join("");
  if (App.workspace) langSel.value = App.workspace.editor_language || "";
}

function updateStatusBar() {
  $("#status-lang").textContent = statusLang();
  $("#status-model").textContent = App.workspace?.selected_model || "";
}

function updateSendButton() {
  const btn = $("#chat-send");
  btn.disabled = App.streaming;
  if (App.streaming) {
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="31" stroke-dashoffset="10"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg>';
  } else {
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  }
}

function updateSidePanel() {
  $$(".side-panel").forEach((el) => el.classList.remove("active"));
  $(`#panel-${App.sidePanel}`).classList.add("active");
  $$(".side-tabs button").forEach((btn) => btn.classList.remove("active"));
  $(`#tab-${App.sidePanel}`).classList.add("active");
}

function updateSelectionMenu() {
  const menu = $("#selection-menu");
  if (App.selectionMenu.show) {
    menu.classList.remove("hidden");
    menu.style.left = App.selectionMenu.x + "px";
    menu.style.top = App.selectionMenu.y + "px";
  } else {
    menu.classList.add("hidden");
  }
}

function updateUI() {
  updateAccount();
  updateTree();
  updateChat();
  updateProjectPanel();
  updateSettings();
  updateStatusBar();
  updateSendButton();
  updateSidePanel();
  $("#file-name").textContent = fileName();
  loadCurrentNodeIntoEditor();
}

async function onAuthSubmit(event) {
  event.preventDefault();
  const mode = App.authMode;
  const payload = {
    username: App.auth.username,
    password: App.auth.password,
    provider: App.auth.provider,
    api_key: App.auth.apiKey,
    api_base_url: App.auth.apiUrl,
  };
  try {
    const data = await api(mode === "register" ? "/api/register" : "/api/login", payload);
    App.user = data.user;
    App.workspace = data.workspace;
    App.authMsg = "";
    await refreshScaffold();
    showWorkspaceView();
    if (!App.editor) await initEditor();
    else loadCurrentNodeIntoEditor();
    updateUI();
  } catch (err) {
    App.authMsg = err.message;
    showAuthMessage();
  }
}

async function adminLogin() {
  try {
    const data = await api("/api/admin-login", { username: App.auth.username });
    App.user = data.user;
    App.workspace = data.workspace;
    App.authMsg = "";
    await refreshScaffold();
    showWorkspaceView();
    if (!App.editor) await initEditor();
    else loadCurrentNodeIntoEditor();
    updateUI();
  } catch (err) {
    App.authMsg = err.message;
    showAuthMessage();
  }
}

async function logout() {
  await api("/api/logout", {});
  location.reload();
}

function selectNode(id) {
  if (App.editor && currentNode()) currentNode().code = App.editor.getValue();
  App.workspace.current_node_id = id;
  loadCurrentNodeIntoEditor();
  updateTree();
  updateChat();
  saveWorkspace();
}

async function newChat() {
  await createBranch("新对话", false);
}

function clearNode() {
  const node = currentNode();
  if (!node) return;
  node.messages = [{ role: "assistant", content: "新对话已开始。" }];
  node.code = "";
  if (App.editor) App.editor.setValue("");
  updateChat();
  saveWorkspace();
}

async function deleteNode(nodeId) {
  const node = App.workspace?.nodes?.[nodeId];
  if (!node) return;
  if (!confirm(`确定删除「${node.title}」及其所有子分支？`)) return;
  try {
    const data = await api("/api/delete-node", { workspace: App.workspace, node_id: nodeId });
    App.workspace = data.workspace;
    updateTree();
    loadCurrentNodeIntoEditor();
    updateChat();
  } catch (err) {
    alert("删除失败：" + err.message);
  }
}

async function createBranch(title, inherit) {
  if (App.editor && currentNode()) currentNode().code = App.editor.getValue();
  try {
    const data = await api("/api/branch", { workspace: App.workspace, title, inherit });
    App.workspace = data.workspace;
    updateTree();
    loadCurrentNodeIntoEditor();
    updateChat();
  } catch (err) {
    alert("创建分支失败：" + err.message);
  }
}

async function sendChat() {
  const prompt = $("#chat-input").value;
  if ((!prompt.trim() && !App.attachedFiles.length) || App.streaming) return;
  await submitChat(prompt, true);
}

function onChatKeydown(event) {
  if (event.key !== "Enter") return;
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    const el = event.target;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = el.value;
    el.value = value.slice(0, start) + "\n" + value.slice(end);
    el.selectionStart = el.selectionEnd = start + 1;
  } else if (!event.shiftKey) {
    event.preventDefault();
    sendChat();
  }
}

async function submitChat(prompt, attachCode = true) {
  if ((!prompt.trim() && !App.attachedFiles.length) || App.streaming) return;
  App.streaming = true;
  updateSendButton();
  if (App.editor && currentNode()) currentNode().code = App.editor.getValue();
  const serverWorkspace = JSON.parse(JSON.stringify(App.workspace));
  let sentContent = prompt;
  if (App.attachedFiles.length) {
    const filesText = App.attachedFiles.map((f) => `【上传文件：${f.name}】\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
    sentContent = sentContent ? `${sentContent}\n\n${filesText}` : filesText;
  }

  if (attachCode && currentNode()?.code?.trim()) {
    sentContent = sentContent ? `${sentContent}\n\n【当前代码】\n\`\`\`${App.workspace.editor_language}\n${currentNode().code.trim()}\n\`\`\`` : `【当前代码】\n\`\`\`${App.workspace.editor_language}\n${currentNode().code.trim()}\n\`\`\``;
  }

  appendStreamingMessage("user", sentContent);
  const assistantMessage = appendStreamingMessage("assistant", "");
  assistantMessage._streaming = true;
  App.attachedFiles = [];
  updateAttachButton();
  saveWorkspaceInBackground();
  $("#chat-input").value = "";
  resizeChatInput();

  App.chatTimeout = setTimeout(() => {
    App.streaming = false;
    updateSendButton();
    assistantMessage.content = "⏱ 响应超时，请检查网络或 API 配置后重试。";
    finalizeStreamingAssistant(assistantMessage);
    App.chatTimeout = null;
  }, 30000);

  try {
    await streamChat({ workspace: serverWorkspace, prompt: sentContent, attach_code: false }, assistantMessage);
  } catch (err) {
    assistantMessage.content = "发送失败，请稍后重试。";
    saveWorkspaceInBackground();
  } finally {
    clearTimeout(App.chatTimeout);
    App.chatTimeout = null;
    if (App._streamingRenderTimer) {
      clearTimeout(App._streamingRenderTimer);
      App._streamingRenderTimer = null;
    }
    App.currentStreamingAssistant = null;
    App.streaming = false;
    assistantMessage._streaming = false;
    updateSendButton();
    finalizeStreamingAssistant(assistantMessage);
  }
}

function appendStreamingMessage(role, content = "") {
  const node = currentNode();
  if (!node) return { role, content };
  if (!node.messages) node.messages = [];
  const msg = { role, content };
  node.messages.push(msg);
  const list = $("#chat-list");
  list.appendChild(createMessageElement(msg));
  smartScrollChatToBottom();
  return msg;
}

async function streamChat(payload, assistantMessage) {
  App._streamDone = false;
  const res = await fetch("/api/chat-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({ error: "请求失败" }));
    throw new Error(data.error || "请求失败");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (!App._streamDone) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    parts.forEach((part) => handleSseEvent(part, assistantMessage));
  }
  reader.cancel().catch(() => {});
}

function handleSseEvent(block, assistantMessage) {
  const eventLine = block.split("\n").find((line) => line.startsWith("event: "));
  const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
  if (!eventLine || !dataLine) return;
  const event = eventLine.slice(7).trim();
  let data;
  try {
    data = JSON.parse(dataLine.slice(6));
  } catch (err) {
    return;
  }
  if (event === "delta") {
    const deltaText = unescapeText(data.text || "");
    assistantMessage.content = (assistantMessage.content || "") + deltaText;
    assistantMessage._unescaped = true;
    const list = $("#chat-list");
    const last = list.lastElementChild;
    if (last && last.classList.contains("assistant")) {
      const contentEl = last.querySelector(".md-content");
      if (contentEl) {
        contentEl.insertAdjacentHTML("beforeend", escapeHtml(deltaText).replace(/\n/g, "<br>"));
      }
    }
    App.currentStreamingAssistant = assistantMessage;
    scheduleStreamingMarkdownRender();
    requestScrollChat();
  } else if (event === "replace") {
    assistantMessage.content = unescapeText(data.text || "");
    assistantMessage._unescaped = true;
    const list = $("#chat-list");
    const last = list.lastElementChild;
    if (last && last.classList.contains("assistant")) {
      const contentEl = last.querySelector(".md-content");
      if (contentEl) {
        const msgForRender = { ...assistantMessage, _streaming: false };
        contentEl.innerHTML = renderMessage(msgForRender);
      }
    }
    smartScrollChatToBottom();
  } else if (event === "done") {
    App._streamDone = true;
    if (App._streamingRenderTimer) {
      clearTimeout(App._streamingRenderTimer);
      App._streamingRenderTimer = null;
    }
    App.currentStreamingAssistant = null;
    if (data.workspace) {
      App.workspace = data.workspace;
      setDirty(false);
    }
    refreshScaffold().then(() => {
      updateProjectPanel();
    });
  }
}

function finalizeStreamingAssistant(assistantMessage) {
  if (!assistantMessage) return;
  assistantMessage._streaming = false;
  const list = $("#chat-list");
  const last = list.lastElementChild;
  if (last && last.classList.contains("assistant")) {
    const contentEl = last.querySelector(".md-content");
    if (contentEl) contentEl.innerHTML = renderMessage(assistantMessage);
  }
  smartScrollChatToBottom();
}

function renderStreamingMarkdownNow() {
  if (!App.streaming || !App.currentStreamingAssistant) return;
  const list = $("#chat-list");
  const last = list.lastElementChild;
  if (last && last.classList.contains("assistant")) {
    const contentEl = last.querySelector(".md-content");
    if (contentEl) {
      const msgForRender = { ...App.currentStreamingAssistant, _streaming: false };
      contentEl.innerHTML = renderMessage(msgForRender);
    }
  }
  requestScrollChat();
}

function scheduleStreamingMarkdownRender() {
  if (App._streamingRenderTimer) return;
  App._streamingRenderTimer = setTimeout(() => {
    App._streamingRenderTimer = null;
    renderStreamingMarkdownNow();
  }, 150);
}

function updateAttachButton() {
  const btn = $("#chat-attach");
  if (!btn) return;
  if (App.attachedFiles.length) {
    btn.setAttribute("data-count", String(App.attachedFiles.length));
    btn.classList.add("has-files");
    const names = App.attachedFiles.map((f) => f.name).join(", ");
    btn.title = `已选择 ${App.attachedFiles.length} 个文件：${names}`;
  } else {
    btn.removeAttribute("data-count");
    btn.classList.remove("has-files");
    btn.title = "上传文本文件";
  }
  renderFileList();
}

function renderFileList() {
  const list = $("#file-list");
  if (!list) return;
  if (!App.attachedFiles.length) {
    list.classList.add("hidden");
    list.innerHTML = "";
    return;
  }
  list.classList.remove("hidden");
  list.innerHTML = App.attachedFiles.map((f, idx) => `<div class="file-chip">
    <span title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
    <button type="button" data-idx="${idx}" title="移除">×</button>
  </div>`).join("");
}

function removeAttachedFile(idx) {
  App.attachedFiles.splice(idx, 1);
  updateAttachButton();
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, content: String(reader.result || "") });
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsText(file);
  });
}

async function handleFileAttach(event) {
  const files = event.target.files;
  if (!files || !files.length) return;
  const maxSize = 2 * 1024 * 1024; // 2MB
  const maxTotal = 5 * 1024 * 1024; // 5MB
  const accepted = ".txt,.py,.js,.cpp,.java,.md,.json,.html,.css,.xml,.yaml,.yml,.c,.h,.hpp,.ts,.jsx,.tsx".split(",");
  for (const file of files) {
    const ext = file.name.includes(".") ? "." + file.name.split(".").pop().toLowerCase() : "";
    if (ext && !accepted.includes(ext)) {
      alert(`「${file.name}」不是支持的文本格式，未加入上传列表。`);
      continue;
    }
    if (file.size > maxSize) {
      alert(`「${file.name}」超过 2MB，未加入上传列表。`);
      continue;
    }
    const currentTotal = App.attachedFiles.reduce((sum, f) => sum + f.content.length, 0);
    if (currentTotal + file.size > maxTotal) {
      alert("上传文件总大小超过 5MB，请减少文件数量。");
      break;
    }
    const exists = App.attachedFiles.some((f) => f.name === file.name);
    if (exists) {
      alert(`「${file.name}」已在列表中。`);
      continue;
    }
    try {
      const data = await readFile(file);
      if (data.content.length > 20000) {
        data.content = data.content.slice(0, 20000) + "\n\n...（内容已截断）";
      }
      App.attachedFiles.push(data);
    } catch (err) {
      alert(`读取「${file.name}」失败：` + err.message);
    }
  }
  updateAttachButton();
  event.target.value = "";
}

function setEditorCodeFromSelection(text, append = false) {
  if (!App.editor || !text) return;
  const current = App.editor.getValue();
  App.editor.setValue(append && current ? `${current}\n${text}` : text);
  if (currentNode()) currentNode().code = App.editor.getValue();
  saveWorkspaceInBackground();
}

function getSelectionText() {
  const text = window.getSelection()?.toString().trim() || "";
  if (text) return text.slice(0, 4000);
  try {
    return App.editor?.getModel()?.getValueInRange(App.editor.getSelection()).trim().slice(0, 4000) || "";
  } catch (err) {
    return "";
  }
}

function onContextMenu(event) {
  const selection = getSelectionText();
  if (!selection) return;
  event.preventDefault();
  App.selectedText = selection;
  App.selectionMenu = { show: true, x: event.clientX, y: event.clientY };
  updateSelectionMenu();
}

function onGlobalClick(event) {
  const applyBtn = event.target.closest(".apply-code-btn");
  if (applyBtn) {
    const code = applyBtn.closest(".code-block")?.querySelector("code")?.textContent || "";
    setEditorCodeFromSelection(code, false);
    return;
  }
  const copyBtn = event.target.closest(".copy-code-btn");
  if (copyBtn) {
    const code = copyBtn.closest(".code-block")?.querySelector("code")?.textContent || "";
    navigator.clipboard.writeText(code);
    return;
  }
  const menu = $("#selection-menu");
  if (menu && !menu.contains(event.target)) {
    App.selectionMenu.show = false;
    updateSelectionMenu();
  }
}

function selectionBranch() {
  App.selectionMenu.show = false;
  updateSelectionMenu();
  if (App.selectedText) createBranch(App.selectedText, true);
}

function selectionAsk() {
  App.selectionMenu.show = false;
  updateSelectionMenu();
  if (App.selectedText) {
    $("#chat-input").value = `请解释这段内容：\n${App.selectedText}`;
    resizeChatInput();
  }
}

function selectionCopy() {
  App.selectionMenu.show = false;
  updateSelectionMenu();
  if (App.selectedText) navigator.clipboard.writeText(App.selectedText);
}

function selectionReplaceCode() {
  App.selectionMenu.show = false;
  updateSelectionMenu();
  setEditorCodeFromSelection(App.selectedText, false);
}

function selectionAppendCode() {
  App.selectionMenu.show = false;
  updateSelectionMenu();
  setEditorCodeFromSelection(App.selectedText, true);
}

async function checkSyntax() {
  if (!currentNode()) return;
  if (App.editor) currentNode().code = App.editor.getValue();
  try {
    const data = await api("/api/syntax", { workspace: App.workspace, code: currentNode().code });
    applyDiagnostics(data.diagnostics);
    alert(data.diagnostics.length ? "发现语法问题" : "语法检查通过");
  } catch (err) {
    alert("语法检查失败：" + err.message);
  }
}

function clearCode() {
  if (!App.editor) return;
  App.editor.setValue("");
  if (currentNode()) currentNode().code = "";
  saveWorkspace();
}

function copyCode() {
  if (!App.editor) return;
  navigator.clipboard.writeText(App.editor.getValue());
}

function sendCodeToAI() {
  submitChat("请帮我看看这段代码，给出分析和建议：", true);
}

function exportWorkspace() {
  const blob = new Blob([JSON.stringify(App.workspace, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "workspace.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function importWorkspace(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const workspace = JSON.parse(text);
    const data = await api("/api/import", { workspace });
    App.workspace = data.workspace;
    loadCurrentNodeIntoEditor();
    updateTree();
    updateChat();
  } catch (err) {
    alert("导入失败：" + err.message);
  }
  event.target.value = "";
}

function onLanguageChange() {
  loadCurrentNodeIntoEditor();
  saveWorkspace();
}

function bindEvents() {
  // Auth tabs
  $("#auth-tab-login").addEventListener("click", () => setAuthMode("login"));
  $("#auth-tab-register").addEventListener("click", () => setAuthMode("register"));

  // Auth inputs
  $("#auth-username").addEventListener("input", (e) => App.auth.username = e.target.value);
  $("#auth-password").addEventListener("input", (e) => App.auth.password = e.target.value);
  $("#auth-provider").addEventListener("change", (e) => App.auth.provider = e.target.value);
  $("#auth-apikey").addEventListener("input", (e) => App.auth.apiKey = e.target.value);
  $("#auth-apiurl").addEventListener("input", (e) => App.auth.apiUrl = e.target.value);

  // Auth form
  $("#auth-form").addEventListener("submit", onAuthSubmit);
  $("#admin-login").addEventListener("click", adminLogin);

  // Account
  $("#logout-btn").addEventListener("click", logout);

  // Side tabs
  $("#tab-tree").addEventListener("click", () => { App.sidePanel = "tree"; updateSidePanel(); });
  $("#tab-project").addEventListener("click", () => { App.sidePanel = "project"; updateSidePanel(); });
  $("#tab-settings").addEventListener("click", () => { App.sidePanel = "settings"; updateSidePanel(); });

  // Tree actions (delegation)
  $("#tree-list").addEventListener("click", (e) => {
    const nodeBtn = e.target.closest(".tree-node");
    if (nodeBtn) {
      selectNode(nodeBtn.dataset.id);
      return;
    }
    const delBtn = e.target.closest(".tree-del-btn");
    if (delBtn) {
      deleteNode(delBtn.dataset.id);
    }
  });

  $("#btn-new-chat").addEventListener("click", newChat);
  $("#btn-clear-node").addEventListener("click", clearNode);
  $("#btn-export").addEventListener("click", exportWorkspace);
  $("#btn-import").addEventListener("change", importWorkspace);
  $("#btn-refresh-scaffold").addEventListener("click", () => refreshScaffold().then(updateProjectPanel));

  // LKG management
  $("#btn-manage-lkg").addEventListener("click", () => {
    App.lkgManaging = true;
    App.lkgSelection.clear();
    App.lkgEditingName = null;
    updateLkgManager();
  });
  $("#lkg-exit").addEventListener("click", () => {
    App.lkgManaging = false;
    App.lkgSelection.clear();
    App.lkgEditingName = null;
    closeLkgForm();
    updateLkgManager();
  });
  $("#lkg-add").addEventListener("click", () => {
    App.lkgEditingName = null;
    openLkgForm();
  });
  $("#lkg-form").addEventListener("submit", onLkgFormSubmit);
  $("#lkg-cancel").addEventListener("click", closeLkgForm);
  $("#lkg-select-all").addEventListener("click", () => {
    const lkg = App.graph?.lkg || [];
    const allSelected = lkg.length && lkg.every((item) => App.lkgSelection.has(item.name));
    if (allSelected) {
      App.lkgSelection.clear();
    } else {
      lkg.forEach((item) => App.lkgSelection.add(item.name));
    }
    renderLkgEditList();
  });
  $("#lkg-batch-delete").addEventListener("click", batchDeleteLkgNodes);
  $("#lkg-edit-list").addEventListener("click", onLkgListClick);

  // LKG visualization
  $("#btn-visualize-lkg").addEventListener("click", openLkgVisualization);
  $("#lkg-viz-close").addEventListener("click", closeLkgVisualization);
  $("#lkg-viz-backdrop").addEventListener("click", closeLkgVisualization);
  $("#lkg-viz-fit").addEventListener("click", fitLkgVisualization);
  $("#lkg-viz-reset").addEventListener("click", resetLkgVisualization);
  $("#lkg-viz-modal").addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLkgVisualization();
  });

  // Settings
  $("#setting-prompt-mode").addEventListener("change", (e) => {
    if (App.workspace) { App.workspace.prompt_mode = e.target.value; saveWorkspace(); }
  });
  $("#setting-model").addEventListener("change", (e) => {
    if (App.workspace) { App.workspace.selected_model = e.target.value; saveWorkspace(); updateStatusBar(); }
  });
  $("#setting-language").addEventListener("change", (e) => {
    if (App.workspace) { App.workspace.editor_language = e.target.value; onLanguageChange(); updateStatusBar(); $("#file-name").textContent = fileName(); }
  });

  // Editor toolbar
  $("#btn-send-code").addEventListener("click", sendCodeToAI);
  $("#btn-clear-code").addEventListener("click", clearCode);
  $("#btn-copy-code").addEventListener("click", copyCode);
  $("#btn-check-syntax").addEventListener("click", checkSyntax);
  $("#btn-save").addEventListener("click", saveWorkspace);

  // Chat
  $("#chat-send").addEventListener("click", sendChat);
  $("#chat-input").addEventListener("keydown", onChatKeydown);
  $("#chat-input").addEventListener("input", resizeChatInput);
  $("#chat-list").addEventListener("scroll", () => {
    App._chatLockedToBottom = isChatNearBottom();
  });
  $("#chat-file-input").addEventListener("change", handleFileAttach);
  $("#file-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".file-chip button");
    if (btn) removeAttachedFile(parseInt(btn.dataset.idx, 10));
  });

  // Selection menu
  $("#sel-branch").addEventListener("click", selectionBranch);
  $("#sel-ask").addEventListener("click", selectionAsk);
  $("#sel-copy").addEventListener("click", selectionCopy);
  $("#sel-replace").addEventListener("click", selectionReplaceCode);
  $("#sel-append").addEventListener("click", selectionAppendCode);

  // Global events
  document.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("click", onGlobalClick);
  window.addEventListener("beforeunload", () => saveWorkspaceInBackground());
}

boot().catch((err) => {
  App.user = null;
  App.authMsg = err.message;
  showAuthMessage();
});
bindEvents();
