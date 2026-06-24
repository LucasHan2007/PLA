import { useCallback, useEffect, useMemo, useState } from 'react'
import CodeAnnotationsPanel from './components/CodeAnnotationsPanel'
import CodeEditorPanel from './components/CodeEditorPanel'
import DebugToolbar from './components/DebugToolbar'
import ExecutionStepsPanel from './components/ExecutionStepsPanel'
import InteractionPanel from './components/InteractionPanel'
import LogicPlanPanel from './components/LogicPlanPanel'
import ReferenceSidebar from './components/ReferenceSidebar'
import { useDebugOptions } from './hooks/useDebugOptions'
import { sendChat } from './services/api'
import type {
  AIStructuredOutput,
  ChatMessage,
  CodeBlock,
  FollowUpQuestion,
  SocraticAnswer,
  WorkflowPhase,
} from './types'
import { mergeOutput } from './utils/mergeOutput'

const PHASE_LABELS: Record<WorkflowPhase, string> = {
  intro: '第一步 · 描述项目',
  project_analysis: '第二步 · 项目解析',
  operation_desc: '第三步 · 操作描述',
  code_design: '第四步 · 代码设计',
}

export default function App() {
  const { skipSocratic, setSkipSocratic } = useDebugOptions()
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

  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>('intro')
  const [revealedStepCount, setRevealedStepCount] = useState(0)
  const [revealedCodeCount, setRevealedCodeCount] = useState(0)

  useEffect(() => {
    if (skipSocratic) return
    const questions = output?.follow_up_questions ?? []
    setSocraticQuestions(questions)
    setSocraticAnswers(questions.map(() => ''))
  }, [output, skipSocratic])

  useEffect(() => {
    if (skipSocratic) {
      setSocraticQuestions([])
      setSocraticAnswers([])
    }
  }, [skipSocratic])

  const stepTotal = output?.execution_steps.length ?? 0
  const codeTotal = output?.code_blocks.length ?? 0

  const visibleLogicPlan = useMemo(
    () => output?.logic_plan ?? [],
    [output?.logic_plan],
  )
  const visibleSteps = useMemo(
    () => (output?.execution_steps ?? []).slice(0, revealedStepCount),
    [output?.execution_steps, revealedStepCount],
  )
  const visibleCodeBlocks = useMemo(
    () => codeBlocks.slice(0, revealedCodeCount),
    [codeBlocks, revealedCodeCount],
  )

  const canSubmit = useMemo(() => {
    if (loading) return false
    const hasChat = chatInput.trim().length > 0
    const hasSocratic = socraticAnswers.some((a) => a.trim().length > 0)
    if (workflowPhase === 'intro') return hasChat
    if (skipSocratic) return true
    return hasChat || hasSocratic
  }, [chatInput, socraticAnswers, workflowPhase, skipSocratic, loading])

  const handleSocraticAnswerChange = (index: number, value: string) => {
    setSocraticAnswers((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const advanceWorkflow = useCallback(
    (
      phase: WorkflowPhase,
      stepCount: number,
      codeCount: number,
      merged: AIStructuredOutput,
      hadSocraticAnswers: boolean,
      hadChat: boolean,
      skipQuestions: boolean,
    ) => {
      let nextPhase = phase
      let nextStep = stepCount
      let nextCode = codeCount
      const answered = hadSocraticAnswers || skipQuestions

      if (phase === 'intro' && hadChat) {
        nextPhase = 'project_analysis'
      }

      if (nextPhase === 'project_analysis') {
        if (merged.analysis_complete && (hadSocraticAnswers || hadChat || skipQuestions)) {
          nextPhase = 'operation_desc'
          nextStep = 0
        }
      } else if (nextPhase === 'operation_desc') {
        if (answered && nextStep < merged.execution_steps.length) {
          nextStep += 1
        }
        if (
          merged.operations_complete &&
          (hadSocraticAnswers || hadChat || skipQuestions)
        ) {
          nextPhase = 'code_design'
          nextCode = 0
        }
      } else if (nextPhase === 'code_design' && answered) {
        if (nextCode < merged.code_blocks.length) {
          nextCode += 1
        }
      }

      setWorkflowPhase(nextPhase)
      setRevealedStepCount(nextStep)
      setRevealedCodeCount(nextCode)
    },
    [],
  )

  const applyChatResponse = useCallback(
    (
      res: { session_id: string; output: AIStructuredOutput },
      apiPhase: WorkflowPhase,
      socraticPayload: SocraticAnswer[],
      chatPart: string,
    ) => {
      setSessionId(res.session_id)
      const inProjectAnalysis =
        apiPhase === 'project_analysis' || workflowPhase === 'project_analysis'
      const inOperationDesc =
        apiPhase === 'operation_desc' || workflowPhase === 'operation_desc'
      const merged = mergeOutput(output, res.output, {
        replaceLogicPlan: inProjectAnalysis,
        replaceExecutionSteps: inOperationDesc,
      })
      setOutput(merged)

      if (merged.code_blocks.length && workflowPhase === 'code_design') {
        setCodeBlocks((prev) => {
          const byName = new Map(prev.map((b) => [b.file_name, b]))
          for (const block of merged.code_blocks) {
            byName.set(block.file_name, block)
          }
          return merged.code_blocks.map((b) => byName.get(b.file_name) ?? b)
        })
      }

      advanceWorkflow(
        workflowPhase,
        revealedStepCount,
        revealedCodeCount,
        merged,
        socraticPayload.length > 0,
        chatPart.length > 0,
        skipSocratic,
      )

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: merged.assistant_message || merged.task_summary,
          output: merged,
        },
      ])
    },
    [
      output,
      workflowPhase,
      revealedStepCount,
      revealedCodeCount,
      advanceWorkflow,
      skipSocratic,
    ],
  )

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || loading) return

    let chatPart = chatInput.trim()
    const socraticPayload: SocraticAnswer[] = socraticQuestions
      .map((item, index) => ({
        question: item.question,
        answer: (socraticAnswers[index] ?? '').trim(),
      }))
      .filter((item) => item.answer.length > 0)

    if (skipSocratic && workflowPhase !== 'intro' && !chatPart && socraticPayload.length === 0) {
      chatPart = '[调试] 跳过提问，继续'
    }

    const apiPhase: WorkflowPhase =
      workflowPhase === 'intro' && chatPart ? 'project_analysis' : workflowPhase

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
      const activeBlock =
        workflowPhase === 'code_design'
          ? visibleCodeBlocks.find((b) => b.file_name)
          : undefined
      const focusStepId =
        workflowPhase === 'operation_desc' || workflowPhase === 'code_design'
          ? activeStepId
          : null

      const res = await sendChat({
        message: chatPart,
        socratic_answers: socraticPayload,
        session_id: sessionId,
        step_id: focusStepId,
        code_context: activeBlock?.code ?? null,
        workflow_phase: apiPhase,
        revealed_plan_count: output?.logic_plan.length ?? 0,
        revealed_step_count: revealedStepCount,
        revealed_code_count: revealedCodeCount,
        debug_skip_socratic: skipSocratic,
      })

      applyChatResponse(res, apiPhase, socraticPayload, chatPart)
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
    visibleCodeBlocks,
    workflowPhase,
    revealedStepCount,
    revealedCodeCount,
    output,
    applyChatResponse,
    skipSocratic,
  ])

  const handleSkipPhase = useCallback(
    async (target: WorkflowPhase) => {
      if (loading) return
      setLoading(true)
      const label = PHASE_LABELS[target]
      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: `[调试] 跳过至：${label}`,
          chatPart: `[调试] 跳过至：${label}`,
        },
      ])

      try {
        const res = await sendChat({
          message: `[调试] 跳过至：${label}`,
          session_id: sessionId,
          workflow_phase: target,
          revealed_plan_count: output?.logic_plan.length ?? 0,
          revealed_step_count:
            target === 'code_design' ? stepTotal : revealedStepCount,
          revealed_code_count: revealedCodeCount,
          debug_skip_to_phase: target,
          debug_skip_socratic: skipSocratic,
        })

        setSessionId(res.session_id)
        const merged = mergeOutput(output, res.output, {
          replaceLogicPlan: true,
          replaceExecutionSteps: true,
        })
        setOutput(merged)

        if (merged.code_blocks.length) {
          setCodeBlocks(merged.code_blocks)
        }

        setWorkflowPhase(target)

        if (target === 'operation_desc') {
          setRevealedStepCount(
            skipSocratic ? merged.execution_steps.length : 0,
          )
        } else if (target === 'code_design') {
          setRevealedStepCount(merged.execution_steps.length)
          setRevealedCodeCount(
            skipSocratic ? merged.code_blocks.length : 0,
          )
        }

        if (!skipSocratic) {
          setSocraticQuestions(merged.follow_up_questions ?? [])
          setSocraticAnswers((merged.follow_up_questions ?? []).map(() => ''))
        }

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: merged.assistant_message || merged.task_summary,
            output: merged,
          },
        ])
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `跳过失败：${err instanceof Error ? err.message : '未知错误'}`,
          },
        ])
      } finally {
        setLoading(false)
      }
    },
    [
      loading,
      sessionId,
      output,
      revealedStepCount,
      revealedCodeCount,
      stepTotal,
      skipSocratic,
    ],
  )

  const handleSelectStep = (stepId: number) => {
    setActiveStepId(stepId)
  }

  const handleCodeChange = (fileName: string, code: string) => {
    setCodeBlocks((prev) =>
      prev.map((b) => (b.file_name === fileName ? { ...b, code } : b)),
    )
  }

  const showReferenceSidebar =
    workflowPhase === 'operation_desc' || workflowPhase === 'code_design'
  const showMainPlan = workflowPhase === 'project_analysis'
  const showMainSteps = workflowPhase === 'operation_desc'
  const showMainCode = workflowPhase === 'code_design'

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-pla-border bg-pla-panel/60 shrink-0 flex-wrap">
        <span className="text-lg font-bold text-pla-accent">PLA</span>
        <span className="text-sm text-pla-text">编程项目学习助手</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-pla-accent/15 text-pla-accent">
          {PHASE_LABELS[workflowPhase]}
        </span>
        {workflowPhase !== 'intro' && (
          <DebugToolbar
            phase={workflowPhase}
            skipSocratic={skipSocratic}
            onSkipSocraticChange={setSkipSocratic}
            onSkipPhase={handleSkipPhase}
            loading={loading}
            hasOutput={!!output}
          />
        )}
      </header>

      {workflowPhase === 'intro' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="shrink-0 px-4 py-2 border-b border-pla-border/50 flex justify-end">
            <DebugToolbar
              phase={workflowPhase}
              skipSocratic={skipSocratic}
              onSkipSocraticChange={setSkipSocratic}
              onSkipPhase={handleSkipPhase}
              loading={loading}
              hasOutput={!!output}
            />
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-6 md:p-10">
            <div className="w-full max-w-lg h-[min(560px,78vh)] flex flex-col rounded-2xl border border-pla-border bg-pla-panel/50 shadow-xl shadow-black/20 overflow-hidden">
              <InteractionPanel
                questions={[]}
                socraticAnswers={[]}
                onSocraticAnswerChange={() => {}}
                messages={messages}
                terms={[]}
                loading={loading}
                chatInput={chatInput}
                onChatInputChange={setChatInput}
                onSubmit={handleSubmit}
                canSubmit={canSubmit}
                mode="intro"
                skipSocratic={skipSocratic}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 flex min-h-0">
            {showReferenceSidebar && (
              <div className="w-44 shrink-0 border-r border-pla-border min-h-0 overflow-hidden">
                <ReferenceSidebar
                  taskSummary={output?.task_summary || ''}
                  logicPlan={output?.logic_plan ?? []}
                  executionSteps={output?.execution_steps ?? []}
                  showSteps={workflowPhase === 'code_design'}
                />
              </div>
            )}

            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {showMainPlan && (
                <div className="flex-[2] min-h-0 overflow-hidden border-b border-pla-border">
                  <LogicPlanPanel
                    taskSummary={output?.task_summary || ''}
                    logicPlan={visibleLogicPlan}
                    activeId={activePlanId}
                    onSelect={setActivePlanId}
                    loading={loading}
                    dynamicMode
                  />
                </div>
              )}

              {showMainSteps && (
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ExecutionStepsPanel
                    steps={visibleSteps}
                    activeStepId={activeStepId}
                    onSelectStep={handleSelectStep}
                    totalCount={stepTotal}
                    awaitingContent={stepTotal === 0}
                    waitingForQuestion={stepTotal > 0 && revealedStepCount === 0}
                    pendingHint={
                      stepTotal > revealedStepCount
                        ? `第 ${revealedStepCount + 1} 步待揭示——请先回答下方引导性问题`
                        : undefined
                    }
                  />
                </div>
              )}

              {showMainCode && (
                <div className="flex-1 flex min-h-0">
                  <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
                    <CodeEditorPanel
                      codeBlocks={visibleCodeBlocks}
                      activeStepId={activeStepId}
                      onCodeChange={handleCodeChange}
                      totalCount={codeTotal}
                      awaitingContent={codeTotal === 0}
                      pendingHint={
                        codeTotal > revealedCodeCount
                          ? `还有 ${codeTotal - revealedCodeCount} 块待揭示——请先完成下方引导性提问`
                          : undefined
                      }
                    />
                  </div>
                  <div className="w-56 shrink-0 min-h-0 overflow-hidden">
                    <CodeAnnotationsPanel codeBlocks={visibleCodeBlocks} />
                  </div>
                </div>
              )}
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
              mode="split"
              skipSocratic={skipSocratic}
            />
          </div>
        </>
      )}
    </div>
  )
}
