let editor = null;
let lastSent = "";
let renderArgs = {};

function sendToStreamlit(type, data) {
  window.parent.postMessage(Object.assign({ isStreamlitMessage: true, type }, data), "*");
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
  if (editor.getValue() !== code) {
    editor.setValue(code || "");
  }
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
      fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: "on",
      renderLineHighlight: "all",
      tabSize: 4,
      wordWrap: "on",
    });

    editor.onDidChangeModelContent(() => {
      const value = editor.getValue();
      if (value !== lastSent) {
        lastSent = value;
        sendToStreamlit("streamlit:setComponentValue", { value });
      }
    });

    document.getElementById("btn-save").onclick = () => {
      const value = editor.getValue();
      lastSent = value;
      sendToStreamlit("streamlit:setComponentValue", { value });
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
    return;
  }
  if (code !== editor.getValue()) {
    setEditorValue(code);
    lastSent = code;
  }
  applyDiagnostics(renderArgs.diagnostics || []);
});

sendToStreamlit("streamlit:componentReady", { apiVersion: 1 });
