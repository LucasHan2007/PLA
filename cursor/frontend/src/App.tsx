import { useCallback, useEffect, useMemo, useState } from 'react'
import CodeEditorPanel from './components/CodeEditorPanel'
import ExecutionStepsPanel from './components/ExecutionStepsPanel'
import InteractionPanel from './components/InteractionPanel'
import LogicPlanPanel from './components/LogicPlanPanel'
import { sendChat } from './services/api'
import type { AIStructuredOutput, ChatMessage, CodeBlock, FollowUpQuestion, SocraticAnswer } from './types'

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [output, setOutput] = useState<AIStructuredOutput | null>(null)
  const [codeBlocks, setCodeBlocks] = useState<CodeBlock[]>([])
  const [activeStepId, setActiveStepId] = useState<number | null>(null)
  const [activePlanId, setActivePlanId] = useState<number | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [socraticQuestions, setSocraticQuestions] = useState<FollowUpQuestion[]>([])
  const [socraticAnswers, setSocraticAnswers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const questions = output?.follow_up_questions ?? []
    setSocraticQuestions(questions)
    setSocraticAnswers(questions.map(() => ''))
  }, [output])

  const canSubmit = useMemo(() => {
    const hasChat = chatInput.trim().length > 0
    const hasSocratic = socraticAnswers.some((a) => a.trim().length > 0)
    return hasChat || hasSocratic
  }, [chatInput, socraticAnswers])

  const handleSocraticAnswerChange = (index: number, value: string) => {
    setSocraticAnswers((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || loading) return

    const chatPart = chatInput.trim()
    const socraticPayload: SocraticAnswer[] = socraticQuestions
      .map((item, index) => ({
        question: item.question,
        answer: (socraticAnswers[index] ?? '').trim(),
      }))
      .filter((item) => item.answer.length > 0)

    setChatInput('')
    setSocraticAnswers(socraticQuestions.map(() => ''))
    setLoading(true)

    if (chatPart || socraticPayload.length > 0) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: chatPart,
          chatPart: chatPart || undefined,
          socraticPart: socraticPayload.length > 0 ? socraticPayload : undefined,
        },
      ])
    }

    try {
      const activeBlock = codeBlocks.find((b) => b.file_name)
      const res = await sendChat({
        message: chatPart,
        socratic_answers: socraticPayload,
        session_id: sessionId,
        step_id: activeStepId,
        code_context: activeBlock?.code,
      })
        setSessionId(res.session_id)
        setOutput(res.output)
        const questions = res.output.follow_up_questions ?? []
        setSocraticQuestions(questions)
        setSocraticAnswers(questions.map(() => ''))
        if (res.output.code_blocks.length) {
        setCodeBlocks(res.output.code_blocks)
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.output.assistant_message || res.output.task_summary,
          output: res.output,
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `请求失败：${err instanceof Error ? err.message : '未知错误'}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }, [
    canSubmit,
    loading,
    chatInput,
    socraticQuestions,
    socraticAnswers,
    sessionId,
    activeStepId,
    codeBlocks,
  ])

  const handleSelectStep = (stepId: number) => {
    setActiveStepId(stepId)
    const step = output?.execution_steps.find((s) => s.step_id === stepId)
    if (step?.code_module && output?.code_blocks) {
      const idx = output.code_blocks.findIndex((b) => b.file_name === step.code_module)
      if (idx >= 0) {
        setCodeBlocks(output.code_blocks)
      }
    }
  }

  const handleCodeChange = (fileName: string, code: string) => {
    setCodeBlocks((prev) =>
      prev.map((b) => (b.file_name === fileName ? { ...b, code } : b)),
    )
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-pla-border bg-pla-panel/60 shrink-0">
        <span className="text-lg font-bold text-pla-accent">PLA</span>
        <span className="text-sm text-pla-text">编程项目学习助手</span>
        <span className="text-xs text-pla-muted hidden sm:inline">
          — 左侧引导性提问 · 右侧自由对话 · 统一提交
        </span>
      </header>

      <div className="flex-1 grid grid-cols-3 min-h-0">
        <div className="border-r border-pla-border min-h-0 overflow-hidden">
          <LogicPlanPanel
            taskSummary={output?.task_summary || ''}
            logicPlan={output?.logic_plan || []}
            activeId={activePlanId}
            onSelect={setActivePlanId}
          />
        </div>
        <div className="border-r border-pla-border min-h-0 overflow-hidden">
          <ExecutionStepsPanel
            steps={output?.execution_steps || []}
            activeStepId={activeStepId}
            onSelectStep={handleSelectStep}
          />
        </div>
        <div className="min-h-0 overflow-hidden">
          <CodeEditorPanel
            codeBlocks={codeBlocks}
            activeStepId={activeStepId}
            onCodeChange={handleCodeChange}
          />
        </div>
      </div>

      <div className="h-[300px] shrink-0">
        <InteractionPanel
          questions={socraticQuestions}
          socraticAnswers={socraticAnswers}
          onSocraticAnswerChange={handleSocraticAnswerChange}
          messages={messages}
          terms={output?.terms || []}
          loading={loading}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSubmit={handleSubmit}
          canSubmit={canSubmit}
        />
      </div>
    </div>
  )
}
