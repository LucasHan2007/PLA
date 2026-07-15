import { useCallback, useEffect, useMemo, useState } from 'react'
import ImplementationPanel from './components/ImplementationPanel'
import KnowledgeGraphPanel from './components/KnowledgeGraphPanel'
import IntroPanel from './components/IntroPanel'
import LearningNodesPanel from './components/LearningNodesPanel'
import TaskQaSidebar from './components/TaskQaSidebar'
import UserProfilingPanel from './components/UserProfilingPanel'
import { PROJECT_TEMPLATES } from './data/projectTemplates'
import { fetchHealth, fetchProfileStatus, fetchGraphStatus, sendProjectParse, sendTaskQa } from './services/api'
import type { ChatMessage } from './types'

/** 四页流程：选项目 → 引导问答 → 学习节点 → 代码生成 */
type Page = 'intro' | 'guide' | 'nodes' | 'code'

const PAGE_LABEL: Record<Page, string> = {
  intro: '页面1 · 选择项目',
  guide: '页面2 · 引导思考',
  nodes: '页面3 · 学习节点',
  code: '页面4 · 代码生成',
}

export default function App() {
  const [page, setPage] = useState<Page>('intro')
  const [showGraph, setShowGraph] = useState(false)

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>('mnist')
  const [customName, setCustomName] = useState('')
  const [customHint, setCustomHint] = useState('')

  const [projectName, setProjectName] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [frameworkReady, setFrameworkReady] = useState(false)
  const [parserLoading, setParserLoading] = useState(false)
  const [parserError, setParserError] = useState<string | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [qaLoading, setQaLoading] = useState(false)
  const [llmOk, setLlmOk] = useState<boolean | null>(null)

  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [currentNodeTitle, setCurrentNodeTitle] = useState<string | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [nodesReady, setNodesReady] = useState(false)
  const [graphPending, setGraphPending] = useState(false)
  const [graphReady, setGraphReady] = useState(false)

  const refreshProfile = useCallback(() => {
    if (!sessionId || !frameworkReady) {
      setCurrentNodeId(null)
      setCurrentNodeTitle(null)
      setProfileReady(false)
      setNodesReady(false)
      return
    }
    fetchProfileStatus(sessionId)
      .then((st) => {
        setProfileReady(st.profile_ready && st.nodes_ready)
        setNodesReady(st.nodes_ready)
        setCurrentNodeId(st.current_node_id)
        setCurrentNodeTitle(st.current_node_title)
      })
      .catch(() => {
        setCurrentNodeId(null)
        setCurrentNodeTitle(null)
        setProfileReady(false)
        setNodesReady(false)
      })
  }, [sessionId, frameworkReady])

  useEffect(() => {
    refreshProfile()
  }, [refreshProfile, page])

  // 后台图谱就绪轮询
  useEffect(() => {
    if (!sessionId || !frameworkReady || graphReady) return
    let cancelled = false
    const tick = async () => {
      try {
        const st = await fetchGraphStatus(sessionId)
        if (cancelled) return
        setGraphPending(!!st.graph_pending)
        setGraphReady(!!st.graph_ready)
      } catch {
        /* ignore */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 3000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [sessionId, frameworkReady, graphReady])

  useEffect(() => {
    fetchHealth()
      .then((h) => setLlmOk(h.llm_configured))
      .catch(() => setLlmOk(false))
  }, [])

  const canStartIntro = useMemo(() => {
    if (customName.trim()) return true
    return selectedTemplateId !== null
  }, [customName, selectedTemplateId])

  const handleStart = useCallback(async () => {
    let name = ''
    let hint = ''
    let templateId: string | null = null
    if (customName.trim()) {
      name = customName.trim()
      hint = customHint.trim()
    } else {
      const t = PROJECT_TEMPLATES.find((p) => p.id === selectedTemplateId)
      if (!t) return
      name = t.name
      hint = t.hint
      templateId = t.id
    }

    setParserLoading(true)
    setParserError(null)
    try {
      const res = await sendProjectParse({
        project_name: name,
        project_hint: hint,
        session_id: null,
        project_template_id: templateId,
      })
      setProjectName(name)
      setSessionId(res.session_id)
      setFrameworkReady(true)
      setGraphReady(!!res.graph_ready)
      setGraphPending(!!res.graph_pending || !res.graph_ready)
      setPage('guide')
      setShowGraph(false)
      const pendingBits: string[] = []
      if (res.graph_pending || !res.graph_ready) pendingBits.push('通用图谱')
      if (res.code_blueprint_pending || !res.code_blueprint_ready) pendingBits.push('代码蓝图')
      const reused = !!res.reused_existing
      setMessages([
        {
          role: 'assistant',
          content:
            (reused
              ? `「${res.project_name}」已有解析，已直接复用，可开始引导问答。`
              : `「${res.project_name}」项目解析已就绪，可开始引导问答。`) +
            (pendingBits.length
              ? `\n\n${pendingBits.join('、')}正在后台生成，稍后可在知识图谱 / 代码模块查看。`
              : '') +
            (res.graph_ready
              ? `\n图谱已就绪（${res.graph_node_count ?? 0} 节点）。`
              : '') +
            (res.code_blueprint_ready
              ? `\n代码蓝图已就绪（${res.code_node_count ?? 0} 节点）。`
              : ''),
        },
      ])
    } catch (err) {
      setParserError(err instanceof Error ? err.message : '项目解析失败')
    } finally {
      setParserLoading(false)
    }
  }, [customName, customHint, selectedTemplateId])

  const canSubmitQa = chatInput.trim().length > 0 && frameworkReady && !qaLoading

  const handleSubmitQa = useCallback(async () => {
    const text = chatInput.trim()
    if (!text || !sessionId || !frameworkReady || qaLoading) return
    setQaLoading(true)
    setMessages((prev) => [...prev, { role: 'user', content: text, chatPart: text }])
    setChatInput('')
    try {
      const res = await sendTaskQa({
        message: text,
        session_id: sessionId,
        project_name: projectName,
        learning_node_id: currentNodeId,
      })
      setSessionId(res.session_id)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.answer,
          strategyLabel: res.strategy_label ?? undefined,
          learningNodeTitle: res.learning_node_title ?? undefined,
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `答疑失败：${err instanceof Error ? err.message : '未知错误'}`,
        },
      ])
    } finally {
      setQaLoading(false)
    }
  }, [chatInput, sessionId, frameworkReady, qaLoading, projectName, currentNodeId])

  const goBack = () => {
    if (showGraph) {
      setShowGraph(false)
      return
    }
    if (page === 'code') setPage('nodes')
    else if (page === 'nodes') setPage('guide')
    else if (page === 'guide') {
      setPage('intro')
      setParserError(null)
    }
  }

  // 页4 代码模块自占三栏（学习节点 | 伪代码 | 详细代码），答疑侧栏在 2–3 页
  const showChat = page === 'guide' || page === 'nodes'

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-pla-border bg-pla-panel/60 shrink-0 flex-wrap">
        <span className="text-lg font-bold text-pla-accent">PLA</span>
        <span className="text-sm text-pla-muted">项目制学习助手</span>
        {page !== 'intro' && projectName && (
          <span className="text-xs text-pla-muted truncate max-w-[200px]">{projectName}</span>
        )}
        <span className="text-xs px-2 py-0.5 rounded-full bg-pla-accent/15 text-pla-accent">
          {showGraph ? '知识图谱' : PAGE_LABEL[page]}
        </span>
        {graphPending && !graphReady && (
          <span className="text-xs text-amber-300/90 animate-pulse">图谱后台生成中…</span>
        )}
        {llmOk === false && (
          <span className="text-xs text-amber-400/90">LLM 未配置（离线演示模式）</span>
        )}
        {page !== 'intro' && (
          <button
            type="button"
            onClick={goBack}
            className="ml-auto text-xs text-pla-muted hover:text-pla-text px-2 py-1 rounded border border-pla-border"
          >
            ← 返回
          </button>
        )}
      </header>

      {page === 'intro' ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6">
          <div className="w-full max-w-lg h-[min(640px,85vh)] flex flex-col rounded-2xl border border-pla-border bg-pla-panel/50 shadow-xl overflow-hidden">
            <IntroPanel
              templates={PROJECT_TEMPLATES}
              selectedId={selectedTemplateId}
              customName={customName}
              customHint={customHint}
              onSelect={(id) => {
                setSelectedTemplateId(id)
                setCustomName('')
              }}
              onCustomNameChange={(v) => {
                setCustomName(v)
                if (v.trim()) setSelectedTemplateId(null)
              }}
              onCustomHintChange={setCustomHint}
              onStart={() => void handleStart()}
              canStart={canStartIntro && !parserLoading}
              loading={parserLoading}
              error={parserError}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
            {showGraph ? (
              <KnowledgeGraphPanel sessionId={sessionId} frameworkReady={frameworkReady} />
            ) : page === 'guide' ? (
              <UserProfilingPanel
                sessionId={sessionId}
                frameworkReady={frameworkReady}
                projectName={projectName}
                onNodesReady={() => {
                  setNodesReady(true)
                  setProfileReady(true)
                  refreshProfile()
                  setPage('nodes')
                }}
              />
            ) : page === 'nodes' ? (
              <LearningNodesPanel
                sessionId={sessionId}
                projectName={projectName}
                nodesReady={nodesReady || profileReady}
                selectedNodeId={currentNodeId}
                onSelectNode={(node) => {
                  setCurrentNodeId(node.id)
                  setCurrentNodeTitle(node.title)
                }}
                onGoCode={() => setPage('code')}
                onShowGraph={() => setShowGraph(true)}
              />
            ) : (
              <ImplementationPanel
                sessionId={sessionId}
                frameworkReady={frameworkReady}
                profileReady={profileReady}
                projectName={projectName}
                nodesReady={nodesReady || profileReady}
                selectedNodeId={currentNodeId}
                onSelectNode={(node) => {
                  setCurrentNodeId(node.id)
                  setCurrentNodeTitle(node.title)
                }}
              />
            )}
          </div>
          {showChat && (
            <TaskQaSidebar
              messages={messages}
              loading={qaLoading || parserLoading}
              chatInput={chatInput}
              onChatInputChange={setChatInput}
              onSubmit={handleSubmitQa}
              canSubmit={canSubmitQa}
              currentNodeTitle={currentNodeTitle}
              pedagogyEnabled={profileReady}
            />
          )}
        </div>
      )}
    </div>
  )
}
