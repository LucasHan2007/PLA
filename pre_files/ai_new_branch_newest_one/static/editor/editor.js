let editor = null;
let lastSent = "";
let renderArgs = {};
let debounceTimer = null;
let editorFocused = false;

function sendToStreamlit(type, data) {
  window.parent.postMessage(Object.assign({ isStreamlitMessage: true, type }, data), "*");
}

function pushValueToStreamlit(value, action) {
  const payload = { code: value, action: action || "edit" };
  const serialized = JSON.stringify(payload);
  if (serialized === lastSent) return;
  lastSent = serialized;
  sendToStreamlit("streamlit:setComponentValue", { value: payload });
}

function schedulePushValue(value) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => pushValueToStreamlit(value, "edit"), 600);
}

function applyDiagnostics(diagnostics) {
  if (!editor || typeof monaco === "undefined") return;
  const model = editor.getModel();
  if (!model) return;
  const markers = (diagnostics || []).map((d) => ({
    startLineNumber: d.line || 1,
    startColumn: d.col || 1,
    endLineNumber: d.endLine || d.line || 1,
    endColumn: d.endCol || 200,
    message: d.message || "",
    severity: d.severity === "warning"
      ? monaco.MarkerSeverity.Warning
      : monaco.MarkerSeverity.Error,
  }));
  monaco.editor.setModelMarkers(model, "owner", markers);
}

function setEditorValue(code) {
  if (!editor) return;
  const next = code || "";
  if (editor.getValue() === next) return;
  const position = editor.getPosition();
  const scrollTop = editor.getScrollTop();
  editor.setValue(next);
  if (position) {
    editor.setPosition(position);
  }
  editor.setScrollTop(scrollTop);
  lastSent = JSON.stringify({ code: next, action: "edit" });
}

function initMonaco(initialCode) {
  require.config({
    paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" },
  });
  require(["vs/editor/editor.main"], function () {
    editor = monaco.editor.create(document.getElementById("container"), {
      value: initialCode || "# 在此编写 Python 代码\n",
      language: "python",
      theme: "vs",
      automaticLayout: true,
      fontSize: 14,
      lineHeight: 21,
      fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: "on",
      renderLineHighlight: "all",
      tabSize: 4,
      wordWrap: "off",
      padding: { top: 8 },
    });

    editor.onDidFocusEditorText(() => {
      editorFocused = true;
    });
    editor.onDidBlurEditorText(() => {
      editorFocused = false;
      pushValueToStreamlit(editor.getValue(), "edit");
    });

    editor.onDidChangeModelContent(() => {
      schedulePushValue(editor.getValue());
    });

    document.getElementById("btn-save").onclick = () => {
      clearTimeout(debounceTimer);
      pushValueToStreamlit(editor.getValue(), "save");
    };

    document.getElementById("btn-check").onclick = () => {
      clearTimeout(debounceTimer);
      pushValueToStreamlit(editor.getValue(), "check");
    };

    document.getElementById("btn-format").onclick = () => {
      editor.getAction("editor.action.formatDocument").run();
    };

    document.getElementById("btn-copy").onclick = async () => {
      await navigator.clipboard.writeText(editor.getValue());
    };

    applyDiagnostics(renderArgs.diagnostics || []);
    sendToStreamlit("streamlit:componentReady", { apiVersion: 1 });
  });
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "streamlit:render") return;
  renderArgs = data.args || {};
  const code = renderArgs.code ?? "";
  if (!editor) {
    initMonaco(code);
    lastSent = JSON.stringify({ code: code, action: "edit" });
    return;
  }
  if (editorFocused) {
    applyDiagnostics(renderArgs.diagnostics || []);
    return;
  }
  if (code !== editor.getValue()) {
    setEditorValue(code);
  }
  applyDiagnostics(renderArgs.diagnostics || []);
});

sendToStreamlit("streamlit:componentReady", { apiVersion: 1 });
