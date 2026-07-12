"""确定性回归测试：验证 code_ref 分支显示自己的 code_blocks，以及子对话合并。"""
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

ROOT = Path(__file__).resolve().parent.parent


def test_markdown_extraction():
    """单元测试：AI 以 markdown 形式返回较大代码时，应提取为 code_blocks；少量代码内联到 reply。"""
    sys.path.insert(0, str(ROOT / "backend"))
    from app_server import apply_ai_reply_to_node

    # 少量代码仍以内联卡片形式出现在 reply 中，但同时生成一个代码标签页
    node_small = {"messages": [], "code": "", "code_blocks": [], "knowledge_points": []}
    raw_small = (
        "思路分析：使用 random 模块生成随机数。\n\n"
        "```python\n"
        "import random\n"
        "print(random.randint(1, 100))\n"
        "```"
    )
    apply_ai_reply_to_node(node_small, raw_small)
    assert len(node_small["code_blocks"]) == 1, "small code should still create one reply tab"
    assert node_small["code_blocks"][0]["file"] == "回复 1", "small code tab name incorrect"
    assert "import random" in node_small["messages"][0]["content"], "small code missing from reply"

    # 单文件代码应保留在 code_blocks，代码区不保留 [CODE:] 标记
    node = {"messages": [], "code": "", "code_blocks": [], "knowledge_points": []}
    raw = (
        "思路分析：使用 random 模块生成随机数。\n\n"
        "见 [CODE:main.py]\n"
        "```python\n"
        "import random\n"
        "import sys\n"
        "def get_random(min_value, max_value):\n"
        "    return random.randint(min_value, max_value)\n"
        "if __name__ == '__main__':\n"
        "    print(get_random(1, 100))\n"
        "```"
    )
    apply_ai_reply_to_node(node, raw)
    assert len(node["code_blocks"]) == 1, f"expected 1 block, got {len(node['code_blocks'])}"
    block = node["code_blocks"][0]
    assert block["file"] == "回复 1", f"expected 回复 1, got {block['file']}"
    assert "[CODE:" not in block["code"], "single-file code should not contain [CODE:] markers"
    assert "import random" in block["code"], "code content missing import random"
    assert node["code"] == block["code"], "node.code not synced"
    return True


def test_knowledge_weight_update():
    """单元测试：AI 返回的 knowledge_nodes weight 应更新 LKG 熟悉度。"""
    sys.path.insert(0, str(ROOT / "backend"))
    import app_server
    from pathlib import Path
    import tempfile

    original_graph = app_server.PROJECT_GRAPH_FILE
    with tempfile.TemporaryDirectory() as tmp:
        tmp_graph = Path(tmp) / "project_graph.json"
        app_server.PROJECT_GRAPH_FILE = tmp_graph
        app_server.write_json_file(tmp_graph, {
            "lkg": [{"name": "std::unique_lock", "description": "锁", "weight": 0.5}]
        })
        app_server.update_scaffold_state({}, [
            {"name": "std::unique_lock", "description": "锁", "type": "concept", "weight": 0.9}
        ])
        graph = app_server.load_graph()
        item = next((n for n in graph["lkg"] if n.get("name") == "std::unique_lock"), {})
        assert item.get("weight") == 0.9, f"weight should be updated to 0.9, got {item.get('weight')}"
        app_server.PROJECT_GRAPH_FILE = original_graph
    return True


def test_project_plan_per_node():
    """单元测试：每个对话节点应有独立的项目规划。"""
    sys.path.insert(0, str(ROOT / "backend"))
    import app_server
    from pathlib import Path
    import tempfile

    original_graph = app_server.PROJECT_GRAPH_FILE
    with tempfile.TemporaryDirectory() as tmp:
        app_server.PROJECT_GRAPH_FILE = Path(tmp) / "project_graph.json"
        node_a = {"project_plan": ""}
        node_b = {"project_plan": ""}
        app_server.update_scaffold_state({"project_markdown": "## 对话 A 的规划"}, [], node_a)
        app_server.update_scaffold_state({"project_markdown": "## 对话 B 的规划"}, [], node_b)
        assert node_a["project_plan"] == "## 对话 A 的规划"
        assert node_b["project_plan"] == "## 对话 B 的规划"
        app_server.PROJECT_GRAPH_FILE = original_graph
    return True


def start_server():
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "backend" / "app_server.py")],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    for _ in range(30):
        try:
            urllib.request.urlopen("http://127.0.0.1:8501/api/config", timeout=1).read()
            return proc
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("后端服务启动失败")


def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def make_driver():
    from selenium.webdriver.edge.options import Options

    opts = Options()
    opts.add_argument("--headless")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1600,900")
    return webdriver.Edge(options=opts)


def wait_visible(driver, selector, timeout=20):
    return WebDriverWait(driver, timeout).until(
        EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
    )


def stub_monaco(driver):
    """用桩替换 Monaco/require，避免 CDN 在 headless 环境加载失败导致 initEditor 挂起。"""
    driver.execute_script("""
        window.require = function(deps, cb) { if (typeof cb === 'function') cb(); };
        window.require.config = function() {};
        window.monaco = {
          KeyMod: { CtrlCmd: 1 },
          KeyCode: { KeyS: 2 },
          editor: {
            create: function(el, cfg) {
              return {
                _value: cfg.value || '',
                setValue: function(v) { this._value = v; },
                getValue: function() { return this._value; },
                getModel: function() { return { setLanguage: function(){} }; },
                onDidChangeModelContent: function(){},
                addCommand: function(){},
                layout: function(){}
              };
            },
            setModelLanguage: function(){},
            setModelMarkers: function(){}
          },
          MarkerSeverity: { Error: 1 }
        };
    """)


def import_workspace(driver, workspace):
    """通过前端 api 函数导入 workspace 并同步到 App 状态。"""
    script = """
        const done = arguments[arguments.length - 1];
        api('/api/import', { workspace: arguments[0] })
          .then(data => {
            App.workspace = data.workspace;
            loadCurrentNodeIntoEditor();
            updateTree();
            done({ ok: true, workspace: data.workspace });
          })
          .catch(err => done({ ok: false, error: err.message || String(err) }));
    """
    return driver.execute_async_script(script, workspace)


def workspace_state(driver):
    return driver.execute_script("""
        const n = App.workspace.nodes[App.workspace.current_node_id];
        return {
            current_id: App.workspace.current_node_id,
            title: n && n.title,
            code: n && n.code,
            code_ref: n && n.code_ref,
            code_blocks: n && n.code_blocks,
            editor_value: App.editor && App.editor.getValue(),
            tree_rows: document.querySelectorAll('#tree-list .tree-row').length,
            toolbar_hidden: document.getElementById('batch-toolbar').classList.contains('hidden'),
            merge_disabled: document.getElementById('btn-batch-merge').disabled
        };
    """)


def new_workspace_nodes():
    root = {
        "id": "root-1",
        "parent_id": None,
        "title": "根对话",
        "messages": [{"role": "assistant", "content": "hello"}],
        "children": ["child-a", "child-b"],
        "code": "# parent code\n",
        "code_blocks": []
    }
    child_a = {
        "id": "child-a",
        "parent_id": "root-1",
        "title": "分支 A",
        "messages": [],
        "children": [],
        "code_ref": "root-1",
        "code": "",
        "code_blocks": [{"file": "child_a.py", "lang": "python", "code": "# code from child A\n", "description": ""}]
    }
    child_b = {
        "id": "child-b",
        "parent_id": "root-1",
        "title": "分支 B",
        "messages": [],
        "children": [],
        "code_ref": "root-1",
        "code": "",
        "code_blocks": [{"file": "child_b.py", "lang": "python", "code": "# code from child B\n", "description": ""}]
    }
    return root, child_a, child_b


def run_tests(driver):
    results = []

    # ---- Test 1: code_ref 分支如果自己有 code_blocks，优先显示自己的代码 ----
    root, child_a, child_b = new_workspace_nodes()
    ws = {
        "nodes": {"root-1": root, "child-a": child_a, "child-b": child_b},
        "current_node_id": "child-a",
        "editor_language": "python",
        "prompt_mode": "直接解答",
        "selected_model": "deepseek-v4-flash"
    }
    res = import_workspace(driver, ws)
    if not res["ok"]:
        results.append(("import-code-ref-own", False, res.get("error")))
        return results
    wait_visible(driver, "#tree-list .tree-row")
    time.sleep(0.5)
    state = workspace_state(driver)
    ok = state["editor_value"] == "# code from child A\n"
    results.append(("code_ref_own_blocks", ok, state))

    # ---- Test 1c: 代码区必须可编辑并保存到当前节点的 code_blocks ----
    driver.execute_script('App.editor.setValue("# edited child A\\n"); persistEditorCode();')
    time.sleep(0.2)
    block_code = driver.execute_script('return App.workspace.nodes["child-a"].code_blocks[0].code')
    results.append(("code_area_editable_own_blocks", block_code == "# edited child A\n", {"block_code": block_code}))

    # ---- Test 1b: 清空按钮应清除当前节点的 code_blocks 和编辑器内容 ----
    driver.execute_script("clearNode();")
    time.sleep(0.3)
    state = workspace_state(driver)
    ok = state["editor_value"] == "" and len(state["code_blocks"]) == 0
    results.append(("clear_node_clears_code", ok, state))

    # ---- Test 2: code_ref 分支没有自己的 code_blocks 时显示父代码 ----
    root2, child_a2, child_b2 = new_workspace_nodes()
    child_a2["code_blocks"] = []
    child_b2["code_blocks"] = []
    ws2 = {
        "nodes": {"root-1": root2, "child-a": child_a2, "child-b": child_b2},
        "current_node_id": "child-a",
        "editor_language": "python",
        "prompt_mode": "直接解答",
        "selected_model": "deepseek-v4-flash"
    }
    import_workspace(driver, ws2)
    wait_visible(driver, "#tree-list .tree-row")
    time.sleep(0.5)
    state = workspace_state(driver)
    ok = state["editor_value"] == "# parent code\n"
    results.append(("code_ref_falls_back_parent", ok, state))

    # ---- Test 2b: code_ref 分支无自身代码块时，编辑代码应保存到父节点（保持可编辑性） ----
    driver.execute_script('App.editor.setValue("# edited parent via child\\n"); persistEditorCode();')
    time.sleep(0.2)
    parent_code = driver.execute_script('return App.workspace.nodes["root-1"].code')
    results.append(("code_area_editable_code_ref", parent_code == "# edited parent via child\n", {"parent_code": parent_code}))

    # ---- Test 3: 勾选两个兄弟子对话后合并按钮启用，合并后保留 code_blocks ----
    root3, child_a3, child_b3 = new_workspace_nodes()
    ws3 = {
        "nodes": {"root-1": root3, "child-a": child_a3, "child-b": child_b3},
        "current_node_id": "root-1",
        "editor_language": "python",
        "prompt_mode": "直接解答",
        "selected_model": "deepseek-v4-flash"
    }
    import_workspace(driver, ws3)
    wait_visible(driver, "#tree-list .tree-row")
    time.sleep(0.5)

    # 勾选 child-a 与 child-b
    driver.find_element(By.CSS_SELECTOR, '.tree-check[data-id="child-a"]').click()
    driver.find_element(By.CSS_SELECTOR, '.tree-check[data-id="child-b"]').click()
    time.sleep(0.3)
    state = workspace_state(driver)
    merge_enabled = not state["toolbar_hidden"] and not state["merge_disabled"]
    results.append(("merge_button_enabled", merge_enabled, state))

    # 绕过 confirm 弹窗并触发合并
    driver.execute_script("window.confirm = function() { return true; };")
    driver.find_element(By.CSS_SELECTOR, "#btn-batch-merge").click()
    WebDriverWait(driver, 10).until(
        lambda d: d.execute_script("return App.workspace.current_node_id !== 'root-1';")
    )
    time.sleep(0.3)
    state = workspace_state(driver)
    ok = (
        state["title"].startswith("合并")
        and len(state["code_blocks"]) == 2
        and state["editor_value"] == "# code from child A\n"
    )
    results.append(("merge_sub_conversations", ok, state))

    # ---- Test 4: 删除合并后的子对话 ----
    merged_id = state["current_id"]
    driver.execute_async_script("""
      const done = arguments[arguments.length-1];
      (async () => {
        App.treeChecked = new Set([arguments[0]]);
        await batchDeleteNodes();
        done('ok');
      })();
    """, merged_id)
    time.sleep(0.3)
    state = workspace_state(driver)
    ok = merged_id not in driver.execute_script('return Object.keys(App.workspace.nodes)') and state["current_id"] == "root-1"
    results.append(("delete_merged_child", ok, state))

    # ---- Test 5: 删除根对话（允许删除，后端会创建新根或切换到其他根） ----
    driver.execute_async_script("""
      const done = arguments[arguments.length-1];
      (async () => {
        App.treeChecked = new Set(['root-1']);
        await batchDeleteNodes();
        done('ok');
      })();
    """)
    time.sleep(0.3)
    state = workspace_state(driver)
    ids = driver.execute_script('return Object.keys(App.workspace.nodes)')
    has_root = any(driver.execute_script(f'return App.workspace.nodes["{i}"].parent_id') is None for i in ids)
    ok = "root-1" not in ids and has_root
    results.append(("delete_root_node", ok, state))

    return results


def main():
    proc = None
    driver = None
    try:
        proc = start_server()
        driver = make_driver()
        driver.get("http://127.0.0.1:8501/")
        wait_visible(driver, "#login-view")
        stub_monaco(driver)
        driver.find_element(By.ID, "auth-username").send_keys("test")
        driver.find_element(By.ID, "admin-login").click()
        wait_visible(driver, "#workspace-view")

        markdown_ok = test_markdown_extraction()
        weight_ok = test_knowledge_weight_update()
        plan_ok = test_project_plan_per_node()
        results = run_tests(driver)
        results.insert(0, ("project_plan_per_node", plan_ok, {}))
        results.insert(1, ("knowledge_weight_update", weight_ok, {}))
        results.insert(2, ("markdown_extract_to_code_blocks", markdown_ok, {}))
        output = {
            "all_passed": all(ok for _, ok, _ in results),
            "tests": [{"name": n, "passed": ok, "detail": d} for n, ok, d in results]
        }
        out_path = ROOT / ".playwright-mcp" / "test_fixes_result.json"
        out_path.parent.mkdir(exist_ok=True)
        out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"结果已写入: {out_path}")
        for name, ok, _ in results:
            print(f"  {'PASS' if ok else 'FAIL'} {name}")
        print("全部通过" if output["all_passed"] else "存在失败")
        return 0 if output["all_passed"] else 1
    finally:
        if driver:
            driver.quit()
        if proc:
            stop_server(proc)


if __name__ == "__main__":
    sys.exit(main())
