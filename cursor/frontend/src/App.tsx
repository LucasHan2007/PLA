import { useCallback, useEffect, useMemo, useState } from 'react'
import ImplementationPanel from './components/ImplementationPanel'
import KnowledgeGraphPanel from './components/KnowledgeGraphPanel'
import IntroPanel from './components/IntroPanel'
import ProjectParserPanel from './components/ProjectParserPanel'
import TaskQaSidebar from './components/TaskQaSidebar'
import UserProfilingPanel from './components/UserProfilingPanel'
import { PROJECT_TEMPLATES } from './data/projectTemplates'
import { fetchHealth, fetchProfileStatus, sendProjectParse, sendTaskQa } from './services/api'
import type { ChatMessage } from './types'

type Phase = 'intro' | 'workspace'
type WorkspaceTab = 'parser' | 'graph' | 'profiling' | 'code'

export default function App() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>('mnist')
  const [customName, setCustomName] = useState('')
  const [customHint, setCustomHint] = useState('')

  const [projectName, setProjectName] = useState('')
  const [projectHint, setProjectHint] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [frameworkReady, setFrameworkReady] = useState(false)
  const [parserLoading, setParserLoading] = useState(false)
  const [parserError, setParserError] = useState<string | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [qaLoading, setQaLoading] = useState(false)
  const [llmOk, setLlmOk] = useState<boolean | null>(null)
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('parser')
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [currentNodeTitle, setCurrentNodeTitle] = useState<string | null>(null)
  const [profileReady, setProfileReady] = useState(false)

  useEffect(() => {
    if (!sessionId || !frameworkReady) {
      setCurrentNodeId(null)
      setCurrentNodeTitle(null)
      setProfileReady(false)
      return
    }
    fetchProfileStatus(sessionId)
      .then((st) => {
        setProfileReady(st.profile_ready && st.nodes_ready)
        setCurrentNodeId(st.current_node_id)
        setCurrentNodeTitle(st.current_node_title)
      })
      .catch(() => {
        setCurrentNodeId(null)
        setCurrentNodeTitle(null)
        setProfileReady(false)
      })
  }, [sessionId, frameworkReady, workspaceTab])

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
      setProjectHint(hint)
      setSessionId(res.session_id)
      setFrameworkReady(true)
      setPhase('workspace')
      setWorkspaceTab('profiling')
      setMessages([
        {
          role: 'assistant',
          content:
            `「${res.project_name}」的八段解析体系已保存至后台。` +
            (res.graph_ready
              ? `基础知识图谱已生成（${res.graph_node_count ?? 0} 个节点）。`
              : '') +
            '\n\n请先在左侧「用户画像」完成宏观问答，再生成学习节点；也可在右侧提问。',
        },
      ])
    } catch (err) {
      setParserError(err instanceof Error ? err.message : '项目解析失败')
    } finally {
      setParserLoading(false)
    }
  }, [customName, customHint, selectedTemplateId])

  const handleGenerate = useCallback(async () => {
    const name = projectName.trim()
    if (!name || parserLoading) return
    setParserLoading(true)
    setParserError(null)
    try {
      const res = await sendProjectParse({
        project_name: name,
        project_hint: projectHint,
        session_id: sessionId,
      })
      setSessionId(res.session_id)
      setFrameworkReady(true)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            `「${res.project_name}」的解析体系已保存至后台。` +
            (res.graph_ready
              ? `基础知识图谱已生成（${res.graph_node_count ?? 0} 个节点），可在「知识图谱」标签查看。`
              : '') +
            ' 可继续用户画像或在右侧提问。',
        },
      ])
    } catch (err) {
      setParserError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setParserLoading(false)
    }
  }, [projectName, projectHint, sessionId, parserLoading])

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

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-pla-border bg-pla-panel/60 shrink-0 flex-wrap">
        <span className="text-lg font-bold text-pla-accent">PLA</span>
        <span className="text-sm text-pla-muted">编程项目学习助手</span>
        {phase === 'workspace' && projectName && (
          <span className="text-xs text-pla-muted truncate max-w-[200px]">{projectName}</span>
        )}
        <span className="text-xs px-2 py-0.5 rounded-full bg-pla-accent/15 text-pla-accent">
          {phase === 'intro'
            ? '选择项目'
            : workspaceTab === 'parser'
              ? '项目解析'
              : workspaceTab === 'graph'
                ? '知识图谱'
                : workspaceTab === 'code'
                  ? '代码辅助'
                  : '用户画像'}
        </span>
        {llmOk === false && (
          <span className="text-xs text-amber-400/90">LLM 未配置（离线演示模式）</span>
        )}
        {phase === 'workspace' && (
          <button
            type="button"
            onClick={() => {
              setPhase('intro')
              setParserError(null)
            }}
            className="ml-auto text-xs text-pla-muted hover:text-pla-text px-2 py-1 rounded border border-pla-border"
          >
            ← 返回
          </button>
        )}
      </header>

      {phase === 'intro' ? (
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
            <div className="shrink-0 flex gap-1 px-3 py-2 border-b border-pla-border bg-pla-panel/40">
              <button
                type="button"
                onClick={() => setWorkspaceTab('parser')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  workspaceTab === 'parser'
                    ? 'bg-pla-accent text-white'
                    : 'text-pla-muted hover:text-pla-text hover:bg-pla-panel'
                }`}
              >
                项目解析
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceTab('graph')}
                disabled={!frameworkReady}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  workspaceTab === 'graph'
                    ? 'bg-pla-accent text-white'
                    : 'text-pla-muted hover:text-pla-text hover:bg-pla-panel disabled:opacity-40'
                }`}
              >
                知识图谱
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceTab('code')}
                disabled={!profileReady}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  workspaceTab === 'code'
                    ? 'bg-pla-accent text-white'
                    : 'text-pla-muted hover:text-pla-text hover:bg-pla-panel disabled:opacity-40'
                }`}
              >
                代码辅助
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceTab('profiling')}
                disabled={!frameworkReady}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  workspaceTab === 'profiling'
                    ? 'bg-pla-accent text-white'
                    : 'text-pla-muted hover:text-pla-text hover:bg-pla-panel disabled:opacity-40'
                }`}
              >
                用户画像
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {workspaceTab === 'parser' && (
                <ProjectParserPanel
                  projectName={projectName}
                  projectHint={projectHint}
                  onProjectNameChange={setProjectName}
                  onProjectHintChange={setProjectHint}
                  frameworkReady={frameworkReady}
                  loading={parserLoading}
                  error={parserError}
                  onGenerate={handleGenerate}
                />
              )}
              {workspaceTab === 'graph' && (
                <KnowledgeGraphPanel sessionId={sessionId} frameworkReady={frameworkReady} />
              )}
              {workspaceTab === 'profiling' && (
                <UserProfilingPanel sessionId={sessionId} frameworkReady={frameworkReady} />
              )}
              {workspaceTab === 'code' && (
                <ImplementationPanel
                  sessionId={sessionId}
                  frameworkReady={frameworkReady}
                  profileReady={profileReady}
                  currentNode={currentNodeId ? { id: currentNodeId, title: currentNodeTitle ?? '' } : null}
                />
              )}
            </div>
          </div>
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
        </div>
      )}
    </div>
  )
}
