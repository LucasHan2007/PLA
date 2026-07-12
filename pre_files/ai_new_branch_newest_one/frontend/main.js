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
  _streamReader: null,
  _streamRawMap: new WeakMap(),
  _streamRenderTimer: null,
  _pendingStreamMessage: null,
  _lastRenderedContent: "",
  _chatLockedToBottom: true,
  attachedFiles: [],
  lkgManaging: false,
  lkgSelection: new Set(),
  lkgEditingName: null,
  lkgVizCy: null,
  lkgVizData: null,
  treeExpanded: new Set(),
  treeChecked: new Set(),
  currentCodeFile: null,  // 当前代码区显示的文件名
  sidebarCollapsed: false,
  _streamChunkBuffer: "",
  _userManuallySwitchedFile: 0,
  recommendations: [],
  recommendLoading: false,
  recommendError: null,
  editingPlan: false,
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

function extractOuterJson(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function stripMarkdownCodeBlocks(text) {
  // 只移除 reply 中过大的 ``` / ~~~ 代码围栏；少量代码保留在对话区显示
  const SMALL_MAX_LINES = 5;
  const SMALL_MAX_CHARS = 300;
  const isLarge = (code) => {
    const lines = code.split("\n").filter((ln) => ln.trim());
    return lines.length > SMALL_MAX_LINES || code.length > SMALL_MAX_CHARS;
  };
  return String(text || "")
    .replace(/```[a-zA-Z0-9]*\s*([\s\S]*?)```/g, (match, code) => (isLarge(code) ? "" : match))
    .replace(/~~~[a-zA-Z0-9]*\s*([\s\S]*?)~~~/g, (match, code) => (isLarge(code) ? "" : match))
    .trim();
}

function extractReply(text) {
  // 从 AI 回复中提取 reply 字段内容。返回 null 表示尚未识别为完整/可渲染内容。
  const original = String(text || "");
  if (!original.trim()) return null;
  const cleanFallback = (s) => stripMarkdownCodeBlocks(unescapeText(s));
  // 没有 JSON 对象时按普通文本返回，支持非代码生成模式
  if (!original.includes("{")) {
    const r = cleanFallback(original);
    return r || null;
  }
  const cleaned = original.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const snippet = extractOuterJson(cleaned);
  // JSON 还没闭合：不做 JSON.parse，只做轻量正则提取，避免每帧都抛异常
  if (!snippet) {
    const looksLikeProtocol =
      original.includes("{") &&
      (original.includes('"reply"') ||
        original.includes('"回复"') ||
        original.includes('"code_blocks"') ||
        original.includes('"action"'));
    if (looksLikeProtocol) {
      for (const key of ["reply", "回复"]) {
        const match = cleaned.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
        if (match) {
          const r = cleanFallback(match[1]);
          if (r) return r;
        }
      }
      return null;
    }
    return cleanFallback(original) || null;
  }
  try {
    const data = JSON.parse(snippet);
    if (typeof data.reply === "string") {
      const r = cleanFallback(data.reply);
      if (r) return r;
    }
    if (typeof data["回复"] === "string") {
      const r = cleanFallback(data["回复"]);
      if (r) return r;
    }
  } catch (e) {}
  // JSON 已完整但解析失败，用正则兜底
  for (const key of ["reply", "回复"]) {
    const match = snippet.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
    if (match) {
      const r = cleanFallback(match[1]);
      if (r) return r;
    }
  }
  return null;
}

function safeExtractReply(text) {
  // 最终渲染使用：绝不返回 null，绝不把原始 JSON 暴露给用户；reply 为空时尽量保留可读文字
  const original = String(text || "");
  if (!original.trim()) return "";
  const result = extractReply(original);
  if (result) return result;
  const cleanFallback = (s) => stripMarkdownCodeBlocks(unescapeText(s));
  const cleaned = original.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const snippet = extractOuterJson(cleaned) || cleaned;
  // 兜底：尝试提取任意可见文本字段
  for (const key of ["reply", "回复", "next_question", "evidence_task", "description", "content"]) {
    const match = snippet.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
    if (match) {
      const r = cleanFallback(match[1]);
      if (r) return r;
    }
  }
  // 保留 { 前面的自然语言
  const braceIdx = original.indexOf("{");
  if (braceIdx > 0) {
    const prefix = original.substring(0, braceIdx).trim();
    if (prefix) return cleanFallback(prefix.replace(/[",:\s]+$/, ""));
  }
  // 最后防线：返回清洗后的原文，防止聊天区完全空白
  return cleanFallback(original);
}

function unescapeText(text) {
  let s = String(text || "")
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "");
  // 处理 JSON \uXXXX Unicode 转义
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return s;
}

function renderCodeReference(text) {
  return escapeHtml(text).replace(/\[CODE:([^\]]+)\]/g, '<span class="code-ref-tag" data-file="$1">📄 $1</span>');
}

function renderAssistantReply(content) {
  // 把 reply 按 [CODE:文件名] 切分成若干段，每段关联到一个文件，便于滚动同步
  const text = String(content || "");
  if (!text.includes("[CODE:")) {
    return renderMarkdownLite(text);
  }
  const parts = text.split(/(\[CODE:[^\]]+\])/g);
  const sections = [];
  let pendingFile = null;
  let pendingText = "";

  function flush() {
    if (pendingFile || pendingText.trim()) {
      sections.push({ file: pendingFile, text: pendingText.trim() });
      pendingFile = null;
      pendingText = "";
    }
  }

  for (const part of parts) {
    const m = part.match(/^\[CODE:([^\]]+)\]$/);
    if (m) {
      flush();
      pendingFile = m[1];
    } else {
      pendingText += part;
    }
  }
  flush();

  return sections
    .map((sec) => {
      const fileAttr = sec.file ? ` data-file="${escapeHtml(sec.file)}"` : "";
      const header = sec.file
        ? `<span class="code-ref-tag code-section-header" data-file="${escapeHtml(sec.file)}">📄 ${escapeHtml(sec.file)}</span>`
        : "";
      const body = sec.text ? renderMarkdownLite(sec.text) : "";
      return `<div class="chat-section"${fileAttr}>${header}${body}</div>`;
    })
    .join("");
}

function renderMessage(msg) {
  let content = msg.content || "";
  if (msg.role === "assistant") {
    content = cleanAssistantContent(content);
    // 最终渲染必须安全提取 reply，绝不允许把原始 JSON 显示在聊天区
    content = safeExtractReply(content);
    // 额外兜底：确保任何情况下聊天区都不渲染代码块
    content = stripMarkdownCodeBlocks(content);
  } else if (msg.role === "user" && content.includes("【当前代码】")) {
    content = content.split("【当前代码】")[0].trim();
  }
  const cacheKey = content + (msg._streaming ? "|s" : "|n");
  let cached = renderCache.get(msg);
  if (cached && cached.key === cacheKey) return cached.html;

  let html;
  if (msg._streaming && msg.role === "assistant") {
    html = renderCodeReference(content);
  } else if (msg.role === "assistant") {
    html = renderAssistantReply(content);
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

function codeNode(node) {
  if (!node) return null;
  // 如果当前节点自己就有代码块，优先使用当前节点（避免 code_ref 分支生成代码后仍显示父对话代码）
  if (Array.isArray(node.code_blocks) && node.code_blocks.length) {
    return node;
  }
  if (node.code_ref && App.workspace?.nodes?.[node.code_ref]) {
    return App.workspace.nodes[node.code_ref];
  }
  return node;
}

function getCodeBlocks(node) {
  const target = codeNode(node);
  if (!target) return [];
  const blocks = target.code_blocks;
  return Array.isArray(blocks) ? blocks : [];
}

function getCurrentCodeBlock() {
  const node = currentNode();
  if (!node) return null;
  const target = codeNode(node);
  const blocks = getCodeBlocks(target);
  if (!blocks.length) return null;
  const currentFile = App.currentCodeFile;
  let block = blocks.find((b) => b.file === currentFile);
  if (!block) block = blocks[0];
  return block;
}

function setCurrentCodeFile(filename) {
  App.currentCodeFile = filename || null;
}

function persistEditorCode() {
  if (!App.editor || !currentNode()) return;
  const value = App.editor.getValue();
  const target = codeNode(currentNode());
  const blocks = getCodeBlocks(target);
  if (blocks.length) {
    const currentFile = App.currentCodeFile || blocks[0].file;
    const block = blocks.find((b) => b.file === currentFile);
    if (block) {
      block.code = value;
      // 兼容：同步到 node.code
      target.code = value;
    }
  } else {
    target.code = value;
  }
}

function sortedTreeIds() {
  if (!App.workspace || !App.workspace.nodes) return [];
  const nodes = App.workspace.nodes;
  const rootIds = Object.entries(nodes)
    .filter(([, node]) => !node.parent_id)
    .map(([id]) => id);
  const ids = [];
  function walk(id, level) {
    const node = nodes[id];
    if (!node || node.archived) return;
    ids.push([id, level]);
    const children = node.children || [];
    if (children.length && App.treeExpanded.has(id)) {
      children.forEach((child) => walk(child, level + 1));
    }
  }
  rootIds.forEach((id) => {
    App.treeExpanded.add(id);
    walk(id, 0);
  });
  return ids;
}

function nodeDepth(id) {
  if (!App.workspace?.nodes || !id) return 0;
  let depth = 0;
  let cur = id;
  while (cur) {
    const node = App.workspace.nodes[cur];
    if (!node) break;
    const parentId = node.parent_id;
    if (!parentId) break;
    depth += 1;
    cur = parentId;
  }
  return depth;
}

function isAncestor(ancestorId, descendantId) {
  if (!App.workspace?.nodes || !ancestorId || !descendantId) return false;
  let cur = App.workspace.nodes[descendantId]?.parent_id;
  while (cur) {
    if (cur === ancestorId) return true;
    const node = App.workspace.nodes[cur];
    if (!node) break;
    cur = node.parent_id;
  }
  return false;
}

function getDescendants(id) {
  const result = new Set();
  if (!App.workspace?.nodes?.[id]) return result;
  function walk(nid) {
    const node = App.workspace.nodes[nid];
    if (!node) return;
    result.add(nid);
    (node.children || []).forEach((child) => walk(child));
  }
  walk(id);
  return result;
}

function getCurrentBranchIds() {
  const ids = new Set();
  if (!App.workspace?.nodes) return ids;
  const currentId = App.workspace.current_node_id;
  if (!currentId) return ids;
  ids.add(currentId);
  let cur = App.workspace.nodes[currentId]?.parent_id;
  while (cur) {
    ids.add(cur);
    const node = App.workspace.nodes[cur];
    if (!node) break;
    cur = node.parent_id;
  }
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

function downloadCurrentCode() {
  if (!App.editor) return;
  persistEditorCode();
  const code = App.editor.getValue();
  const block = getCurrentCodeBlock();
  const filename = block?.file || fileName();
  const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  if (App.editor && currentNode()) persistEditorCode();
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
  persistEditorCode();
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
        persistEditorCode();
        setDirty(true);
      });
      try {
        App.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveWorkspace());
      } catch (err) {
        // 快捷键绑定失败不应阻塞整个登录/初始化流程
        console.warn("编辑器快捷键绑定失败:", err);
      }
      resolve();
    });
  });
}

function loadCurrentNodeIntoEditor() {
  if (!App.editor) return;
  const node = currentNode();
  if (!node) return;
  const codeNodeResolved = codeNode(node);
  const blocks = getCodeBlocks(codeNodeResolved);
  const lang = App.languages[App.workspace?.editor_language] || App.languages?.python;
  let code = "";
  let fileLang = lang?.monaco || "python";
  if (blocks.length) {
    const currentFile = App.currentCodeFile;
    let block = blocks.find((b) => b.file === currentFile) || blocks[0];
    code = block.code || "";
    fileLang = block.lang || fileLang;
    setCurrentCodeFile(block.file);
  } else {
    code = codeNodeResolved.code || "";
    setCurrentCodeFile(null);
  }
  App.editor.setValue(code);
  monaco.editor.setModelLanguage(App.editor.getModel(), fileLang);
  renderCodeTabs();
  updateFileName();
  setDirty(false);
  applyDiagnostics([]);
}

function renderCodeTabs() {
  const tabs = $("#code-tabs");
  if (!tabs) return;
  const node = currentNode();
  if (!node) return;
  const target = codeNode(node);
  const blocks = getCodeBlocks(target);
  tabs.classList.remove("hidden");
  const currentFile = App.currentCodeFile || (blocks[0] && blocks[0].file);
  const tabHtml = blocks.map((b) => {
    const active = b.file === currentFile ? " active" : "";
    return `<button class="code-tab${active}" data-file="${escapeHtml(b.file)}">
      <span class="code-tab-label">${escapeHtml(b.file)}</span>
      <span class="code-tab-close" data-file="${escapeHtml(b.file)}" title="关闭">×</span>
    </button>`;
  }).join("");
  tabs.innerHTML = tabHtml + `<button class="code-tab-add" data-action="add-tab" title="新建文件">+</button>`;
}

function updateFileName() {
  const el = $("#file-name");
  if (!el) return;
  const block = getCurrentCodeBlock();
  el.textContent = block ? block.file : `solution.${(App.languages[App.workspace?.editor_language] || App.languages?.python)?.ext || "py"}`;
}

function switchCodeFile(filename) {
  if (!filename) return;
  const node = currentNode();
  if (!node) return;
  const target = codeNode(node);
  const blocks = getCodeBlocks(target);
  const block = blocks.find((b) => b.file === filename);
  if (!block) return;
  // 保存当前文件
  persistEditorCode();
  setCurrentCodeFile(filename);
  App.editor.setValue(block.code || "");
  const lang = App.languages[App.workspace?.editor_language] || App.languages?.python;
  monaco.editor.setModelLanguage(App.editor.getModel(), block.lang || lang?.monaco || "python");
  renderCodeTabs();
  updateFileName();
}

async function closeCodeFile(filename) {
  if (!filename) return;
  const node = currentNode();
  if (!node) return;
  const target = codeNode(node);
  const blocks = getCodeBlocks(target);
  const idx = blocks.findIndex((b) => b.file === filename);
  if (idx < 0) return;
  blocks.splice(idx, 1);
  if (target === node) {
    node.code_blocks = blocks;
    node.code = blocks.length ? blocks[0].code : "";
  }
  if (blocks.length === 0) {
    // 所有代码标签都已关闭，代码区应恢复为空白文件
    App.currentCodeFile = null;
    if (App.editor) App.editor.setValue("");
  } else if (App.currentCodeFile === filename) {
    App.currentCodeFile = blocks[Math.min(idx, blocks.length - 1)].file;
    if (App.editor) {
      const next = blocks.find((b) => b.file === App.currentCodeFile);
      App.editor.setValue(next ? next.code : "");
    }
  }
  renderCodeTabs();
  updateFileName();
  try {
    await api("/api/workspace", { workspace: App.workspace });
  } catch (err) {
    console.error("保存 workspace 失败", err);
  }
}

async function addNewCodeFile() {
  const node = currentNode();
  if (!node) return;
  const target = codeNode(node);
  const blocks = getCodeBlocks(target);
  const workspaceLang = App.workspace?.editor_language || "python";
  const langInfo = App.languages[workspaceLang] || App.languages.python;
  const ext = langInfo?.ext || "py";
  const name = prompt(`新建文件名（含扩展名，如 main.${ext}）：`, `new_file.${ext}`);
  if (!name || !name.trim()) return;
  const file = name.trim();
  if (blocks.some((b) => b.file === file)) {
    alert("该文件名已存在");
    return;
  }
  persistEditorCode();
  const newBlock = {
    file,
    description: "",
    lang: workspaceLang,
    code: "",
  };
  blocks.push(newBlock);
  if (target === node) {
    node.code_blocks = blocks;
  }
  setCurrentCodeFile(file);
  App.editor.setValue("");
  monaco.editor.setModelLanguage(App.editor.getModel(), langInfo?.monaco || "python");
  renderCodeTabs();
  updateFileName();
  try {
    await api("/api/workspace", { workspace: App.workspace });
  } catch (err) {
    console.error("保存 workspace 失败", err);
  }
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
  if (App.workspace?.current_node_id) {
    expandAncestors(App.workspace.current_node_id);
  }
  const list = $("#tree-list");
  const ids = sortedTreeIds();
  if (!ids.length) {
    list.innerHTML = "";
    updateBatchToolbar();
    return;
  }
  const currentBranch = getCurrentBranchIds();
  list.innerHTML = ids.map(([id, level]) => {
    const node = App.workspace.nodes[id];
    const isCurrent = id === App.workspace.current_node_id;
    const hasChildren = (node.children || []).length > 0;
    const isExpanded = App.treeExpanded.has(id);
    const toggleIcon = hasChildren ? (isExpanded ? "▼" : "▶") : "<span class='tree-toggle-spacer'></span>";
    const icon = isCurrent ? "📍" : "📁";
    const refMark = node.code_ref ? '<span class="tree-ref-mark" title="引用父对话代码区">↳</span>' : "";
    const checked = App.treeChecked.has(id) ? "checked" : "";
    const inCurrentBranch = currentBranch.has(id);
    const checkedBranch = [...App.treeChecked].some((cid) => cid === id || isAncestor(cid, id));
    const rowClass = [
      "tree-row",
      isCurrent ? "current" : "",
      inCurrentBranch && !isCurrent ? "ancestor" : "",
      checkedBranch ? "checked-branch" : "",
    ].filter(Boolean).join(" ");
    return `<div class="${rowClass}" data-id="${escapeHtml(id)}" style="--tree-level:${level}">
      <input type="checkbox" class="tree-check" data-id="${escapeHtml(id)}" ${checked}>
      <button class="tree-toggle" data-id="${escapeHtml(id)}" ${hasChildren ? "" : "tabindex=\"-1\""}>${toggleIcon}</button>
      <button class="tree-node${isCurrent ? " active" : ""}" data-id="${escapeHtml(id)}">
        <span class="tree-icon">${icon}</span>
        <span class="tree-title">${refMark} ${escapeHtml(node.title || "对话")}</span>
      </button>
    </div>`;
  }).join("");
  updateBatchToolbar();
}

function createMessageElement(msg) {
  const el = document.createElement("div");
  el.className = `msg ${msg.role}`;
  if (msg.role === "assistant" && msg.tab) {
    el.dataset.tab = msg.tab;
  }
  const roleLabel = msg.role === "user" ? "你" : "AI";
  el.innerHTML = `<div class="role">${roleLabel}</div><div class="md-content"></div>`;
  const contentEl = el.querySelector(".md-content");
  if (msg.role === "assistant" && msg._streaming && !(msg.content || "").trim()) {
    contentEl.innerHTML = `<span class="streaming-indicator">AI 正在输出<span>.</span><span>.</span><span>.</span></span>`;
  } else {
    contentEl.innerHTML = renderMessage(msg);
  }
  return el;
}

function renderChatList() {
  const list = $("#chat-list");
  const msgs = visibleMessages();
  list.innerHTML = "";
  msgs.forEach((msg) => list.appendChild(createMessageElement(msg)));
  observeChatSections();
  smartScrollChatToBottom();
}

let _chatScrollSyncTimer = null;

function syncChatScrollToCode() {
  if (App.streaming) return;
  const list = $("#chat-list");
  if (!list) return;
  // 避免与手动切换/新回复冲突
  if (App._userManuallySwitchedFile && Date.now() - App._userManuallySwitchedFile < 800) return;

  const listRect = list.getBoundingClientRect();
  const centerY = listRect.top + listRect.height * 0.45;
  const candidates = Array.from(list.querySelectorAll(".chat-section[data-file], .msg.assistant[data-tab]"));
  if (!candidates.length) return;

  let best = null;
  let bestDist = Infinity;
  candidates.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const elCenter = rect.top + rect.height / 2;
    const dist = Math.abs(elCenter - centerY);
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  });

  // 如果已经滚到底部，优先使用最后一个候选，避免短消息在视口下方导致没被选到
  if (isChatNearBottom(80)) {
    best = candidates[candidates.length - 1];
  }

  if (best) {
    // chat-section 的 data-file 是具体文件名，但代码标签页可能是“回复 N”，优先用最近消息的标签
    let target = best.dataset.tab;
    if (!target && best.dataset.file) {
      const msg = best.closest(".msg.assistant[data-tab]");
      target = msg ? msg.dataset.tab : best.dataset.file;
    }
    if (target) syncCodeToChatSection(target);
  }
}

function requestChatScrollSync() {
  if (App._chatScrollSyncTimer) clearTimeout(App._chatScrollSyncTimer);
  App._chatScrollSyncTimer = setTimeout(syncChatScrollToCode, 80);
}

function observeChatSections() {
  // 新章节渲染后，延迟同步一次当前可见区域对应的代码标签
  requestChatScrollSync();
}

function syncCodeToChatSection(file) {
  if (!file) return;
  const node = currentNode();
  if (!node) return;
  const target = codeNode(node);
  const blocks = getCodeBlocks(target);
  const hasFile = blocks.some((b) => b.file === file);
  if (!hasFile) return;
  // 避免与手动编辑/点击冲突：如果用户最近手动切换过文件，则不同步
  if (App._userManuallySwitchedFile && Date.now() - App._userManuallySwitchedFile < 800) return;
  if (App.currentCodeFile !== file) {
    switchCodeFile(file);
  }
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
  // 项目规划跟随当前对话切换，不再回退到全局/其他对话的规划
  const plan = String(currentNode()?.project_plan || "");
  const planEl = $("#project-plan");
  const editorEl = $("#project-plan-editor");
  if (App.editingPlan) {
    planEl.classList.add("hidden");
    editorEl.classList.remove("hidden");
  } else {
    planEl.classList.remove("hidden");
    editorEl.classList.add("hidden");
    if (!plan.trim()) {
      planEl.classList.add("muted");
      planEl.innerHTML = "暂无项目规划";
    } else {
      planEl.classList.remove("muted");
      planEl.innerHTML = renderMarkdownLite(plan);
    }
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
  renderRecommendations();
}

function togglePlanEdit(show) {
  App.editingPlan = show;
  if (show) {
    const textarea = $("#project-plan-textarea");
    if (textarea) textarea.value = currentNode()?.project_plan || "";
  }
  updateProjectPanel();
}

async function savePlan() {
  const textarea = $("#project-plan-textarea");
  if (!textarea) return;
  const plan = textarea.value;
  try {
    const data = await api("/api/scaffold", { action: "save_plan", project_markdown: plan, workspace: App.workspace });
    if (data.workspace) App.workspace = data.workspace;
    App.scaffold = { ...App.scaffold, project_markdown: data.project_markdown };
    togglePlanEdit(false);
  } catch (err) {
    alert("保存项目规划失败：" + err.message);
  }
}

async function clearPlan() {
  if (!confirm("确定清空当前对话的项目规划？知识图谱仍保持共享。")) return;
  try {
    const data = await api("/api/scaffold", { action: "clear_plan", workspace: App.workspace });
    if (data.workspace) App.workspace = data.workspace;
    App.scaffold = { ...App.scaffold, project_markdown: "" };
    // 共享的知识图谱不受当前对话规划清空的影响
    App.graph = App.graph || { project_profile: {}, pcg: { nodes: [], edges: [] }, lkg: [], latest: {} };
    updateProjectPanel();
  } catch (err) {
    alert("清空项目规划失败：" + err.message);
  }
}

async function fetchRecommendations() {
  if (!App.workspace || App.recommendLoading) return;
  App.recommendLoading = true;
  App.recommendError = null;
  renderRecommendations();
  // 前端兜底：35 秒后如果还没返回，强制结束加载态
  const safetyTimer = setTimeout(() => {
    if (App.recommendLoading) {
      App.recommendLoading = false;
      App.recommendError = "请求超时，请重试";
      renderRecommendations();
    }
  }, 35000);
  try {
    const data = await api("/api/recommend-knowledge", { workspace: App.workspace });
    App.recommendations = data.recommendations || [];
  } catch (err) {
    App.recommendError = err.message;
    App.recommendations = [];
  } finally {
    clearTimeout(safetyTimer);
    App.recommendLoading = false;
    renderRecommendations();
  }
}

function renderRecommendations() {
  const list = $("#recommend-list");
  if (!list) return;
  if (App.recommendLoading) {
    list.innerHTML = `<div class="recommend-empty">
      <div style="margin-bottom:8px">🔄 正在生成推荐…</div>
      <div style="font-size:12px;opacity:.7">AI 正在分析你的知识画像与项目规划</div>
    </div>`;
    return;
  }
  if (App.recommendError) {
    list.innerHTML = `<div class="recommend-error">
      <div>❌ 推荐生成失败</div>
      <div style="font-size:12px;opacity:.8;margin-top:4px">${escapeHtml(App.recommendError)}</div>
      <button type="button" onclick="fetchRecommendations()">重试</button>
    </div>`;
    return;
  }
  const recs = App.recommendations;
  if (!recs.length) {
    const hasLkg = (App.graph?.lkg || []).length > 0;
    const hasPlan = (currentNode()?.project_plan || "").trim().length > 0;
    let tip = "";
    if (!hasPlan && !hasLkg) {
      tip = "先和 AI 聊聊你的项目，我会自动提取知识点并生成推荐";
    } else if (!hasPlan) {
      tip = "已有知识图谱，但缺少项目规划。请尝试切换到「LearnScaffold项目规划」模式进行对话";
    } else if (!hasLkg) {
      tip = "已有项目规划，但知识图谱为空。继续对话即可自动提取知识点";
    } else {
      tip = "当前知识图谱已覆盖较完整，暂无新推荐。继续对话深入探索";
    }
    list.innerHTML = `<div class="recommend-empty">
      <div style="margin-bottom:6px">💡 暂无推荐知识点</div>
      <div style="font-size:12px;opacity:.7">${escapeHtml(tip)}</div>
    </div>`;
    return;
  }
  list.innerHTML = recs.map((rec) => {
    const relevance = Math.round((rec.relevance || 0) * 100);
    return `<div class="recommend-item" data-name="${escapeHtml(rec.name)}" title="点击开始与 AI 探讨「${escapeHtml(rec.name)}」">
      <div class="recommend-item-header">
        <span class="recommend-item-name">${escapeHtml(rec.name)}</span>
        <span class="recommend-item-score">相关度 ${relevance}%</span>
      </div>
      <div class="recommend-item-desc">${escapeHtml(rec.description || "")}</div>
      ${rec.reason ? `<div class="recommend-item-reason">${escapeHtml(rec.reason)}</div>` : ""}
      <div class="recommend-item-action">💬 点击开始对话</div>
    </div>`;
  }).join("");
}

function startChatAboutKnowledge(name, description) {
  const prompt = description
    ? `我想深入学习「${name}」，请给我详细讲解：${description}`
    : `我想深入学习「${name}」，请给我详细讲解这个知识点`;

  const input = $("#chat-input");
  if (input) {
    input.value = prompt;
    input.focus();
    resizeChatInput();
  }

  // 滚动到聊天输入区
  const chatForm = $("#chat-form");
  if (chatForm) chatForm.scrollIntoView({ behavior: "smooth", block: "end" });

  // 自动发送
  submitChat(prompt, true);
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

async function quickAddKnowledge() {
  const name = prompt("知识点名称：");
  if (!name || !name.trim()) return;
  const description = prompt("知识点描述（可选）：") || "";
  const node = { name: name.trim(), description: description.trim() };
  try {
    await saveLkgNode(node);
    // 显示成功提示
    const list = $("#knowledge-list");
    if (list) {
      const notice = document.createElement("div");
      notice.className = "knowledge-item";
      notice.style.cssText = "background:#ecfdf5;border-color:#a7f3d0;animation:fadeIn .3s ease;";
      notice.innerHTML = `<strong style="color:#059669;">✓ 已添加</strong> ${escapeHtml(node.name)}`;
      list.insertBefore(notice, list.firstChild);
      setTimeout(() => notice.remove(), 2000);
    }
  } catch (err) {
    alert("添加失败：" + err.message);
  }
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

const edgeTypeLabels = {
  related: "相关",
  depends_on: "依赖",
  implicit: "推断",
  sequence: "顺序",
  prerequisite: "前置",
  used_in: "用于",
  leads_to: "导致",
  belongs_to: "属于",
};

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
          label: (ele) => edgeTypeLabels[ele.data("type")] || ele.data("type") || "",
          "font-size": 10,
          color: "#64748b",
          "text-background-color": "rgba(255,255,255,0.85)",
          "text-background-opacity": 1,
          "text-background-padding": "1px 4px",
          "text-background-shape": "roundrectangle",
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
  const models = App.user?.models || ["deepseek-v4-flash"];
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

function updateSendStopButton() {
  const btn = $("#chat-send-stop");
  if (!btn) return;
  btn.disabled = false;
  btn.classList.toggle("streaming", App.streaming);
  if (App.streaming) {
    btn.title = "停止生成";
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  } else {
    btn.title = "发送";
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  }
}

function stopStreaming() {
  if (!App.streaming) return;
  App._streamDone = true;
  if (App._streamReader) {
    App._streamReader.cancel().catch(() => {});
    App._streamReader = null;
  }
  App.streaming = false;
  if (App.currentStreamingAssistant) {
    App.currentStreamingAssistant._streaming = false;
    finalizeStreamingAssistant(App.currentStreamingAssistant);
  }
  App.currentStreamingAssistant = null;
  clearTimeout(App.chatTimeout);
  App.chatTimeout = null;
  updateSendStopButton();
}

function updateSidebarCollapsed() {
  const workspace = $("#workspace-view");
  const expandBtn = $("#sidebar-expand");
  if (!workspace) return;
  workspace.classList.toggle("sidebar-collapsed", App.sidebarCollapsed);
  if (expandBtn) expandBtn.classList.toggle("hidden", !App.sidebarCollapsed);
  // Monaco 编辑器需要重新布局
  if (App.editor) App.editor.layout();
}

function toggleSidebarCollapsed() {
  App.sidebarCollapsed = !App.sidebarCollapsed;
  updateSidebarCollapsed();
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
  updateSendStopButton();
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

function expandAncestors(id) {
  if (!App.workspace?.nodes || !id) return;
  let cur = App.workspace.nodes[id]?.parent_id;
  while (cur) {
    App.treeExpanded.add(cur);
    const node = App.workspace.nodes[cur];
    if (!node) break;
    cur = node.parent_id;
  }
}

function selectNode(id) {
  stopStreaming();
  persistEditorCode();
  App.workspace.current_node_id = id;
  expandAncestors(id);
  loadCurrentNodeIntoEditor();
  updateTree();
  updateChat();
  updateProjectPanel();
  saveWorkspace();
}

async function newChat() {
  stopStreaming();
  persistEditorCode();
  try {
    const data = await api("/api/new-chat", { workspace: App.workspace, title: "新对话" });
    App.workspace = data.workspace;
    App.treeExpanded.clear();
    App.treeChecked.clear();
    updateTree();
    loadCurrentNodeIntoEditor();
    updateChat();
    updateProjectPanel();
  } catch (err) {
    alert("创建新对话失败：" + err.message);
  }
}

function clearNode() {
  stopStreaming();
  const node = currentNode();
  if (!node) return;
  node.messages = [{ role: "assistant", content: "新对话已开始。" }];
  node.code = "";
  node.code_blocks = [];
  App.currentCodeFile = null;
  if (App.editor) App.editor.setValue("");
  renderCodeTabs();
  updateFileName();
  updateChat();
  saveWorkspace();
}

async function deleteNode(nodeId) {
  stopStreaming();
  const node = App.workspace?.nodes?.[nodeId];
  if (!node) return;
  if (!confirm(`确定删除「${node.title}」及其所有子分支？`)) return;
  try {
    const data = await api("/api/delete-node", { workspace: App.workspace, node_id: nodeId });
    App.workspace = data.workspace;
    App.treeChecked.delete(nodeId);
    updateTree();
    loadCurrentNodeIntoEditor();
    updateChat();
    updateProjectPanel();
  } catch (err) {
    alert("删除失败：" + err.message);
  }
}


async function batchDeleteNodes() {
  stopStreaming();
  const ids = [...App.treeChecked];
  if (!ids.length) return;
  const names = ids.map((id) => App.workspace?.nodes?.[id]?.title || "对话").join("、\u300c");
  if (!confirm(`确定删除选中的 ${ids.length} 个对话及其子分支？\n\n包括：${names}`)) return;
  try {
    // 逐个删除，先删深层节点避免父节点先删导致子节点丢失
    const sortedByDepth = ids
      .map((id) => ({ id, depth: nodeDepth(id) }))
      .sort((a, b) => b.depth - a.depth);
    for (const { id } of sortedByDepth) {
      const node = App.workspace?.nodes?.[id];
      if (!node) continue;
      const data = await api("/api/delete-node", { workspace: App.workspace, node_id: id });
      App.workspace = data.workspace;
    }
    App.treeChecked.clear();
    updateTree();
    loadCurrentNodeIntoEditor();
    updateChat();
    updateProjectPanel();
  } catch (err) {
    alert("批量删除失败：" + err.message);
  }
}

async function batchMergeNodes() {
  stopStreaming();
  const ids = [...App.treeChecked];
  if (ids.length !== 2) {
    alert("请恰好勾选两个子对话进行合并。");
    return;
  }
  const [a, b] = ids;
  const nodeA = App.workspace?.nodes?.[a];
  const nodeB = App.workspace?.nodes?.[b];
  if (!nodeA || !nodeB) return;
  if (nodeA.parent_id !== nodeB.parent_id || !nodeA.parent_id) {
    alert("只能合并同一父对话下的两个子对话。");
    return;
  }
  if (!confirm(`确定合并「${nodeA.title}」和「${nodeB.title}」？\n\n合并后会生成一个新的子对话，原来的两个对话会被删除。`)) return;
  try {
    const data = await api("/api/merge-nodes", { workspace: App.workspace, node_a: a, node_b: b });
    App.workspace = data.workspace;
    App.treeChecked.clear();
    updateTree();
    loadCurrentNodeIntoEditor();
    updateChat();
    updateProjectPanel();
  } catch (err) {
    alert("合并失败：" + err.message);
  }
}

function updateBatchToolbar() {
  const toolbar = $("#batch-toolbar");
  const mergeBtn = $("#btn-batch-merge");
  const deleteBtn = $("#btn-batch-delete");
  if (!toolbar || !mergeBtn || !deleteBtn) return;
  const count = App.treeChecked.size;
  toolbar.classList.toggle("hidden", count === 0);
  // 合并按钮只在选中两个且为兄弟子对话时启用
  const ids = [...App.treeChecked];
  let canMerge = ids.length === 2;
  if (canMerge) {
    const [a, b] = ids;
    const nodeA = App.workspace?.nodes?.[a];
    const nodeB = App.workspace?.nodes?.[b];
    canMerge = nodeA && nodeB && nodeA.parent_id && nodeA.parent_id === nodeB.parent_id;
  }
  mergeBtn.disabled = !canMerge;
  deleteBtn.disabled = count === 0;
}

async function createBranch(title, inherit, codeRef = false) {
  stopStreaming();
  persistEditorCode();
  const currentId = App.workspace?.current_node_id;
  if (currentId && nodeDepth(currentId) >= 2) {
    alert("对话树最多支持到孙子分支，不能创建曾孙分支。");
    return;
  }
  try {
    const data = await api("/api/branch", { workspace: App.workspace, title, inherit, code_ref: codeRef });
    App.workspace = data.workspace;
    // 自动展开父节点并选中新分支
    if (currentId) App.treeExpanded.add(currentId);
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
  App._streamChunkBuffer = "";
  updateSendStopButton();
  persistEditorCode();
  const serverWorkspace = JSON.parse(JSON.stringify(App.workspace));
  let sentContent = prompt;
  if (App.attachedFiles.length) {
    const filesText = App.attachedFiles.map((f) => `【上传文件：${f.name}】\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
    sentContent = sentContent ? `${sentContent}\n\n${filesText}` : filesText;
  }

  if (attachCode && currentNode()?.code?.trim()) {
    sentContent = sentContent ? `${sentContent}\n\n【当前代码】\n\`\`\`${App.workspace.editor_language}\n${codeNode(currentNode()).code.trim()}\n\`\`\`` : `【当前代码】\n\`\`\`${App.workspace.editor_language}\n${codeNode(currentNode()).code.trim()}\n\`\`\``;
  }

  appendStreamingMessage("user", sentContent);
  const assistantMessage = appendStreamingMessage("assistant", "");
  assistantMessage._streaming = true;
  App._streamRawMap.set(assistantMessage, "");
  App._pendingStreamMessage = null;
  App._streamRenderTimer = null;
  App.attachedFiles = [];
  updateAttachButton();
  saveWorkspaceInBackground();
  $("#chat-input").value = "";
  resizeChatInput();

  App.chatTimeout = setTimeout(() => {
    App.streaming = false;
    updateSendStopButton();
    assistantMessage._timedOut = true;
    assistantMessage.content = "⏱ 响应超时，请检查网络或 API 配置后重试。";
    if (App._streamReader) {
      App._streamReader.cancel().catch(() => {});
      App._streamReader = null;
    }
    finalizeStreamingAssistant(assistantMessage);
    App.chatTimeout = null;
  }, 120000);

  try {
    await streamChat({ workspace: serverWorkspace, prompt: sentContent, attach_code: false }, assistantMessage);
  } catch (err) {
    assistantMessage.content = "发送失败，请稍后重试。";
    saveWorkspaceInBackground();
  } finally {
    clearTimeout(App.chatTimeout);
    App.chatTimeout = null;
    App.currentStreamingAssistant = null;
    App.streaming = false;
    assistantMessage._streaming = false;
    updateSendStopButton();
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

function scheduleStreamingRender(assistantMessage) {
  App._pendingStreamMessage = assistantMessage;
  if (App._streamRenderTimer) return;
  App._streamRenderTimer = requestAnimationFrame(() => {
    App._streamRenderTimer = null;
    flushStreamingRender();
  });
}

function flushStreamingRender() {
  const assistantMessage = App._pendingStreamMessage;
  App._pendingStreamMessage = null;
  if (!assistantMessage || assistantMessage._timedOut) return;
  // 用原始累积内容统一解析，避免每帧都跑 extractReply
  const rawContent = App._streamRawMap.get(assistantMessage) || "";
  const prevContent = assistantMessage.content || "";
  const extracted = extractReply(rawContent);
  const content = extracted === null ? prevContent : extracted;
  assistantMessage.content = content;
  const list = $("#chat-list");
  const last = list.lastElementChild;
  if (last && last.classList.contains("assistant")) {
    const contentEl = last.querySelector(".md-content");
    if (contentEl) {
      const currentText = contentEl.dataset.renderedText || "";
      if (content === currentText) return;
      if (currentText && content.startsWith(currentText)) {
        const added = content.slice(currentText.length);
        if (added) {
          contentEl.insertAdjacentHTML("beforeend", escapeHtml(added).replace(/\n/g, "<br>"));
        }
      } else {
        contentEl.innerHTML = escapeHtml(stripMarkdownCodeBlocks(content)).replace(/\n/g, "<br>");
      }
      contentEl.dataset.renderedText = content;
    }
  }
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
  App._streamReader = reader;
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
  App._streamReader = null;
}

function handleSseEvent(block, assistantMessage) {
  const lines = block.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event: "));
  const dataLine = lines.find((line) => line.startsWith("data: "));
  if (!eventLine || !dataLine) return;
  const event = eventLine.slice(7).trim();
  let data;
  try {
    data = JSON.parse(dataLine.slice(6));
  } catch (err) {
    return;
  }
  if (event === "delta") {
    if (assistantMessage._timedOut) return;
    const deltaText = String(data.text || "");
    App._streamChunkBuffer += deltaText;
    const rawContent = (App._streamRawMap.get(assistantMessage) || "") + deltaText;
    App._streamRawMap.set(assistantMessage, rawContent);
    App.currentStreamingAssistant = assistantMessage;
    // 立即安排渲染；requestAnimationFrame 会把多个 delta 合并到下一帧，降低 DOM 开销
    scheduleStreamingRender(assistantMessage);
    requestScrollChat();
  } else if (event === "replace") {
    if (assistantMessage._timedOut) return;
    flushStreamingRender();
    assistantMessage.content = data.text || "";
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
    if (assistantMessage._timedOut) return;
    flushStreamingRender();
    App._streamDone = true;
    App.currentStreamingAssistant = null;
    if (typeof data.reply === "string") {
      assistantMessage.content = data.reply;
    }
    if (data.workspace) {
      App.workspace = data.workspace;
      setDirty(false);
      const node = currentNode();
      const target = codeNode(node);
      const blocks = getCodeBlocks(target);
      if (blocks.length) {
        App.currentCodeFile = blocks[blocks.length - 1].file;
      }
      loadCurrentNodeIntoEditor();
      // 新回复到达后，短时间内屏蔽对话滚动同步，避免代码区被旧消息重新切走
      App._userManuallySwitchedFile = Date.now();
      updateChat();
    }
    refreshScaffold().then(() => {
      updateProjectPanel();
    });
  }
}

function finalizeStreamingAssistant(assistantMessage) {
  if (!assistantMessage) return;
  flushStreamingRender();
  assistantMessage._streaming = false;
  // 兜底：如果 content 为空但原始流里有数据，从原始流重新安全提取
  const raw = App._streamRawMap.get(assistantMessage) || "";
  if (!assistantMessage.content?.trim() && raw.trim()) {
    assistantMessage.content = safeExtractReply(raw);
  }
  const list = $("#chat-list");
  const last = list.lastElementChild;
  if (last && last.classList.contains("assistant")) {
    const contentEl = last.querySelector(".md-content");
    if (contentEl) contentEl.innerHTML = renderMessage(assistantMessage);
  }
  observeChatSections();
  smartScrollChatToBottom();
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
  persistEditorCode();
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
  const codeRef = event.target.closest(".code-ref-tag");
  if (codeRef) {
    App._userManuallySwitchedFile = Date.now();
    const msg = codeRef.closest(".msg.assistant");
    if (msg && msg.dataset.tab) {
      switchCodeFile(msg.dataset.tab);
    }
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
  if (App.editor) persistEditorCode();
  try {
    const data = await api("/api/syntax", { workspace: App.workspace, code: codeNode(currentNode()).code });
    applyDiagnostics(data.diagnostics);
    alert(data.diagnostics.length ? "发现语法问题" : "语法检查通过");
  } catch (err) {
    alert("语法检查失败：" + err.message);
  }
}

function clearCode() {
  if (!App.editor) return;
  App.editor.setValue("");
  const node = currentNode();
  if (node) {
    const target = codeNode(node);
    const blocks = getCodeBlocks(target);
    if (blocks.length) {
      const currentFile = App.currentCodeFile || blocks[0].file;
      const block = blocks.find((b) => b.file === currentFile);
      if (block) block.code = "";
    }
    target.code = "";
  }
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
  stopStreaming();
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
    updateProjectPanel();
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

  // Tree checkbox selection (use change so the native checked state is stable)
  $("#tree-list").addEventListener("change", (e) => {
    const check = e.target.closest(".tree-check");
    if (!check) return;
    const id = check.dataset.id;
    if (check.checked) {
      App.treeChecked.add(id);
    } else {
      App.treeChecked.delete(id);
    }
    updateTree();
  });

  // Tree actions (delegation)
  $("#tree-list").addEventListener("click", (e) => {
    const toggle = e.target.closest(".tree-toggle");
    if (toggle) {
      e.stopPropagation();
      const id = toggle.dataset.id;
      if (App.treeExpanded.has(id)) {
        App.treeExpanded.delete(id);
      } else {
        App.treeExpanded.add(id);
      }
      updateTree();
      return;
    }
    const nodeBtn = e.target.closest(".tree-node");
    if (nodeBtn) {
      selectNode(nodeBtn.dataset.id);
      return;
    }
  });

  // Code tabs
  $("#code-tabs")?.addEventListener("click", (e) => {
    const closeBtn = e.target.closest(".code-tab-close");
    if (closeBtn) {
      e.stopPropagation();
      closeCodeFile(closeBtn.dataset.file);
      return;
    }
    const addBtn = e.target.closest(".code-tab-add");
    if (addBtn) {
      addNewCodeFile();
      return;
    }
    const tab = e.target.closest(".code-tab");
    if (tab) {
      App._userManuallySwitchedFile = Date.now();
      switchCodeFile(tab.dataset.file);
    }
  });

  $("#sidebar-collapse").addEventListener("click", toggleSidebarCollapsed);
  $("#sidebar-expand").addEventListener("click", toggleSidebarCollapsed);
  $("#btn-new-chat").addEventListener("click", newChat);
  $("#btn-clear-node").addEventListener("click", clearNode);
  $("#btn-batch-merge").addEventListener("click", batchMergeNodes);
  $("#btn-batch-delete").addEventListener("click", batchDeleteNodes);
  $("#btn-export").addEventListener("click", exportWorkspace);
  $("#btn-import").addEventListener("change", importWorkspace);
  $("#btn-refresh-scaffold").addEventListener("click", () => refreshScaffold().then(updateProjectPanel));
  $("#btn-edit-plan").addEventListener("click", () => togglePlanEdit(true));
  $("#btn-save-plan").addEventListener("click", savePlan);
  $("#btn-cancel-edit-plan").addEventListener("click", () => togglePlanEdit(false));
  $("#btn-clear-plan").addEventListener("click", clearPlan);
  $("#btn-refresh-recommend").addEventListener("click", fetchRecommendations);
  $("#recommend-list")?.addEventListener("click", async (e) => {
    const item = e.target.closest(".recommend-item");
    if (!item) return;
    const name = item.dataset.name;
    const idx = App.recommendations.findIndex((r) => r.name === name);
    if (idx < 0) return;
    const rec = App.recommendations[idx];
    // 先加入知识图谱
    try {
      await saveLkgNode({
        name: rec.name,
        description: rec.description || rec.reason || "",
        weight: Math.round((rec.relevance || 0.5) * 10) / 10,
      });
    } catch (err) {
      console.error("加入知识图谱失败", err);
    }
    // 从推荐列表移除
    App.recommendations.splice(idx, 1);
    renderRecommendations();
    // 再发起对话
    startChatAboutKnowledge(rec.name, rec.description);
  });

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
  $("#btn-add-knowledge").addEventListener("click", quickAddKnowledge);
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
  $("#btn-save").addEventListener("click", downloadCurrentCode);

  // Chat
  $("#chat-send-stop").addEventListener("click", () => {
    if (App.streaming) stopStreaming();
    else sendChat();
  });
  $("#chat-input").addEventListener("keydown", onChatKeydown);
  $("#chat-input").addEventListener("input", resizeChatInput);
  $("#chat-list").addEventListener("scroll", () => {
    App._chatLockedToBottom = isChatNearBottom();
    requestChatScrollSync();
  });
  // 点击对话区里的 [CODE:文件名] 引用，自动切换到对应回复标签页
  $("#chat-list").addEventListener("click", (e) => {
    const ref = e.target.closest(".code-ref-tag");
    if (ref && ref.dataset.file) {
      App._userManuallySwitchedFile = Date.now();
      const msg = ref.closest(".msg.assistant");
      if (msg && msg.dataset.tab) {
        switchCodeFile(msg.dataset.tab);
      }
    }
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
