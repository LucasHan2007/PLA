import { useCallback, useEffect, useMemo, useState } from 'react'
import CodeAnnotationsPanel from './components/CodeAnnotationsPanel'
import CodeEditorPanel from './components/CodeEditorPanel'
import DebugToolbar from './components/DebugToolbar'
import ExecutionStepsPanel from './components/ExecutionStepsPanel'
import IntroPanel from './components/IntroPanel'
import InteractionPanel from './components/InteractionPanel'
import ProjectAnalysisStepPanel from './components/ProjectAnalysisStepPanel'
import ReferenceSidebar from './components/ReferenceSidebar'
import { SKIP_ANSWER } from './components/SocraticPanel'
import { getPresetProject, PRESET_PROJECTS } from './data/presetProjects'
import type { PresetProject } from './data/mnistDigitProject'
import { sendTaskQa } from './services/api'
import {
  advanceAnalysisNextStep,
  advancePresetPhase,
  getCurrentAnalysisTask,
  getPresetCodeQuestion,
  getPresetOperationQuestion,
  presetAnalysisIntroMessage,
  presetAnalysisStepMessage,
  presetAssistantAfterCodeStep,
  presetAssistantAfterOperationStep,
  presetCodeIntroMessage,
  presetOperationIntroMessage,
} from './services/presetWorkflow'
import type { ChatMessage, CodeBlock, FollowUpQuestion, SocraticAnswer, WorkflowPhase } from './types'
import {
  buildVisibleOperationView,
  countTotalSubSteps,
  getNextHiddenSubStep,
} from './utils/operationSteps'

const PHASE_LABELS: Record<WorkflowPhase, string> = {
  intro: '第一步 · 选择项目',
  project_analysis: '第二步 · 项目解析',
  operation_desc: '第三步 · 操作描述',
  code_design: '第四步 · 代码设计',
}

function takeFirstQuestion(questions: FollowUpQuestion[] | undefined) {
  return (questions ?? []).slice(0, 1)
}

export default function App() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [codeBlocks, setCodeBlocks] = useState<CodeBlock[]>([])
  const [activeSubKey, setActiveSubKey] = useState<string | null>(null)
  const [activeStepId, setActiveStepId] = useState<number | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [socraticQuestions, setSocraticQuestions] = useState<FollowUpQuestion[]>([])
  const [socraticAnswers, setSocraticAnswers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>('intro')
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0)
  const [revealedStepCount, setRevealedStepCount] = useState(0)
  const [revealedCodeCount, setRevealedCodeCount] = useState(0)
  const [announcedAnalysisSteps, setAnnouncedAnalysisSteps] = useState<Set<number>>(
    () => new Set(),
  )

  const presetProject = useMemo(
    () => (selectedProjectId ? getPresetProject(selectedProjectId) : undefined),
    [selectedProjectId],
  )

  const presetOutput = presetProject?.output ?? null
  const executionGroups = presetOutput?.execution_steps ?? []
  const planTotal = presetOutput?.logic_plan.length ?? 0
  const stepTotal = useMemo(() => countTotalSubSteps(executionGroups), [executionGroups])
  const codeTotal = presetOutput?.code_blocks.length ?? 0

  const currentAnalysisTask = useMemo(
    () => (presetProject ? getCurrentAnalysisTask(presetProject, analysisStepIndex) : null),
    [presetProject, analysisStepIndex],
  )

  const currentPlanItem = useMemo(() => {
    if (!presetOutput || analysisStepIndex <= 0) return null
    return presetOutput.logic_plan[analysisStepIndex - 1] ?? null
  }, [presetOutput, analysisStepIndex])

  const visibleOperationGroups = useMemo(
    () => buildVisibleOperationView(executionGroups, revealedStepCount),
    [executionGroups, revealedStepCount],
  )

  const nextHiddenSubStep = useMemo(
    () => getNextHiddenSubStep(executionGroups, revealedStepCount),
    [executionGroups, revealedStepCount],
  )

  const visibleCodeBlocks = useMemo(
    () => codeBlocks.slice(0, revealedCodeCount),
    [codeBlocks, revealedCodeCount],
  )

  const syncPresetQuestions = useCallback(
    (project: PresetProject, phase: WorkflowPhase, op: number, code: number) => {
      let questions: FollowUpQuestion[] = []
      if (phase === 'operation_desc') {
        questions = getPresetOperationQuestion(project, op)
      } else if (phase === 'code_design') {
        questions = getPresetCodeQuestion(project, code)
      }
      setSocraticQuestions(takeFirstQuestion(questions))
      setSocraticAnswers(questions.map(() => ''))
    },
    [],
  )

  useEffect(() => {
    if (!presetProject || workflowPhase === 'intro' || workflowPhase === 'project_analysis') return
    syncPresetQuestions(presetProject, workflowPhase, revealedStepCount, revealedCodeCount)
  }, [
    presetProject,
    workflowPhase,
    revealedStepCount,
    revealedCodeCount,
    syncPresetQuestions,
  ])

  const canSubmit = useMemo(() => {
    if (loading) return false
    const hasChat = chatInput.trim().length > 0
    const hasSocratic = socraticAnswers.some((a) => a.trim().length > 0)
    if (workflowPhase === 'intro') {
      return selectedProjectId !== null
    }
    if (workflowPhase === 'project_analysis') {
      return hasChat
    }
    return hasChat || hasSocratic
  }, [chatInput, socraticAnswers, workflowPhase, loading, selectedProjectId])

  const handleSocraticAnswerChange = (index: number, value: string) => {
    setSocraticAnswers((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const handleProjectStart = useCallback(() => {
    if (!selectedProjectId) return
    const project = getPresetProject(selectedProjectId)
    if (!project) return

    setSelectedProjectId(project.id)
    setCodeBlocks(project.output.code_blocks)
    setAnalysisStepIndex(1)
    setRevealedStepCount(0)
    setRevealedCodeCount(0)
    setWorkflowPhase('project_analysis')
    setChatInput('')
    setSessionId(null)
    setAnnouncedAnalysisSteps(new Set())
    setMessages([
      {
        role: 'assistant',
        content: presetAnalysisIntroMessage(project),
      },
    ])
  }, [selectedProjectId])

  const handleAnalysisQuestion = useCallback(
    async (chatPart: string) => {
      if (!presetProject || !currentAnalysisTask || !currentPlanItem) return

      setLoading(true)
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: chatPart, chatPart },
      ])
      setChatInput('')

      try {
        const res = await sendTaskQa({
          message: chatPart,
          session_id: sessionId,
          project_name: presetProject.name,
          step_index: analysisStepIndex,
          step_total: planTotal,
          plan_title: currentPlanItem.title,
          plan_content: currentPlanItem.content,
          task_title: currentAnalysisTask.title,
          task_summary: currentAnalysisTask.summary,
        })
        setSessionId(res.session_id)
        setMessages((prev) => [...prev, { role: 'assistant', content: res.answer }])
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `答疑失败：${err instanceof Error ? err.message : '未知错误'}`,
          },
        ])
      } finally {
        setLoading(false)
      }
    },
    [
      presetProject,
      currentAnalysisTask,
      currentPlanItem,
      sessionId,
      analysisStepIndex,
      planTotal,
    ],
  )

  const handleAnalysisNextStep = useCallback(() => {
    if (!presetProject || loading) return

    const { revealedPlanCount: nextStep, enterOperationDesc } = advanceAnalysisNextStep(
      analysisStepIndex,
      planTotal,
    )

    if (enterOperationDesc) {
      setWorkflowPhase('operation_desc')
      setRevealedStepCount(0)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: presetOperationIntroMessage(presetProject) },
      ])
      syncPresetQuestions(presetProject, 'operation_desc', 0, 0)
      return
    }

    setAnalysisStepIndex(nextStep)

    setAnnouncedAnalysisSteps((announced) => {
      if (announced.has(nextStep)) return announced

      const planItem = presetProject.output.logic_plan[nextStep - 1]
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: presetAnalysisStepMessage(
            nextStep,
            planItem?.title ?? '',
            planTotal,
          ),
        },
      ])
      return new Set(announced).add(nextStep)
    })
  }, [presetProject, loading, analysisStepIndex, planTotal, syncPresetQuestions])

  const handleAnalysisPrevStep = useCallback(() => {
    if (loading || analysisStepIndex <= 1) return
    setAnalysisStepIndex((prev) => prev - 1)
  }, [loading, analysisStepIndex])

  const handlePresetSubmit = useCallback(
    (chatPart: string, socraticPayload: SocraticAnswer[]) => {
      if (!presetProject) return

      const primaryAnswer = socraticPayload[0]?.answer ?? ''
      const hadSocratic = socraticPayload.length > 0
      const hadChat = chatPart.length > 0

      if (chatPart || socraticPayload.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'user',
            content: chatPart || socraticPayload.map((s) => s.answer).join(' '),
            chatPart: chatPart || undefined,
            socraticPart: socraticPayload.length > 0 ? socraticPayload : undefined,
          },
        ])
      }

      const prevPhase = workflowPhase
      const advanced = advancePresetPhase(
        workflowPhase,
        analysisStepIndex,
        revealedStepCount,
        revealedCodeCount,
        presetProject,
        hadSocratic,
        primaryAnswer,
      )

      let assistantText = ''
      if (prevPhase === 'operation_desc') {
        if (advanced.phase === 'code_design') {
          assistantText = presetCodeIntroMessage(presetProject)
        } else {
          assistantText = presetAssistantAfterOperationStep(
            advanced.revealedSubStepCount,
            stepTotal,
          )
        }
      } else if (prevPhase === 'code_design') {
        assistantText = presetAssistantAfterCodeStep(
          advanced.revealedCodeCount,
          codeTotal,
        )
      }

      if (hadChat && !hadSocratic && prevPhase !== 'project_analysis') {
        assistantText =
          (assistantText ? `${assistantText} ` : '') +
          '已收到你的补充说明；预设内容不会变更，请继续完成引导性提问。'
      }

      setWorkflowPhase(advanced.phase)
      setAnalysisStepIndex(advanced.revealedPlanCount)
      setRevealedStepCount(advanced.revealedSubStepCount)
      setRevealedCodeCount(advanced.revealedCodeCount)

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assistantText || '请继续。' },
      ])
    },
    [
      presetProject,
      workflowPhase,
      analysisStepIndex,
      revealedStepCount,
      revealedCodeCount,
      planTotal,
      stepTotal,
      codeTotal,
    ],
  )

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || loading || workflowPhase === 'intro') return

    const chatPart = chatInput.trim()

    if (workflowPhase === 'project_analysis') {
      handleAnalysisQuestion(chatPart)
      return
    }

    const socraticPayload: SocraticAnswer[] = socraticQuestions
      .map((item, index) => ({
        question: item.question,
        answer: (socraticAnswers[index] ?? '').trim(),
      }))
      .filter((item) => item.answer.length > 0)

    setChatInput('')
    setSocraticAnswers(socraticQuestions.map(() => ''))
    handlePresetSubmit(chatPart, socraticPayload)
  }, [
    canSubmit,
    loading,
    chatInput,
    socraticQuestions,
    socraticAnswers,
    workflowPhase,
    handlePresetSubmit,
    handleAnalysisQuestion,
  ])

  const handleSkipQuestion = useCallback(async () => {
    if (loading || socraticQuestions.length === 0) return
    const question = socraticQuestions[0]
    setSocraticAnswers([''])
    handlePresetSubmit('', [{ question: question.question, answer: SKIP_ANSWER }])
  }, [loading, socraticQuestions, handlePresetSubmit])

  const handleSkipPhase = useCallback(
    (target: WorkflowPhase) => {
      if (loading || !presetProject) return
      const label = PHASE_LABELS[target]
      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: `[调试] 跳过至：${label}`,
          chatPart: `[调试] 跳过至：${label}`,
        },
        {
          role: 'assistant',
          content: `已跳过至「${label}」。`,
        },
      ])

      setWorkflowPhase(target)
      if (target === 'project_analysis') {
        setAnalysisStepIndex(planTotal)
      } else if (target === 'operation_desc') {
        setAnalysisStepIndex(planTotal)
        setRevealedStepCount(0)
      } else if (target === 'code_design') {
        setAnalysisStepIndex(planTotal)
        setRevealedStepCount(stepTotal)
        setRevealedCodeCount(0)
      }
    },
    [loading, presetProject, planTotal, stepTotal],
  )

  const handleSelectSubStep = (groupIndex: number, subId: number) => {
    setActiveSubKey(`${groupIndex}-${subId}`)
  }

  const operationDescPendingHint = useMemo(() => {
    if (!nextHiddenSubStep) return undefined
    const { group, subIndex } = nextHiddenSubStep
    return `大步骤「${group.title}」中第 ${subIndex + 1} 个小步骤待揭示——请先回答下方引导性问题`
  }, [nextHiddenSubStep])

  const analysisNextLabel =
    analysisStepIndex >= planTotal ? '进入操作描述' : '下一步'

  const handleCodeChange = (fileName: string, code: string) => {
    setCodeBlocks((prev) =>
      prev.map((b) => (b.file_name === fileName ? { ...b, code } : b)),
    )
  }

  const showReferenceSidebar =
    workflowPhase === 'operation_desc' || workflowPhase === 'code_design'
  const showMainSteps = workflowPhase === 'operation_desc'
  const showMainCode = workflowPhase === 'code_design'

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-pla-border bg-pla-panel/60 shrink-0 flex-wrap">
        <span className="text-lg font-bold text-pla-accent">PLA</span>
        <span className="text-sm text-pla-text">编程项目学习助手</span>
        {presetProject && workflowPhase !== 'intro' && (
          <span className="text-xs text-pla-muted">{presetProject.name}</span>
        )}
        <span className="text-xs px-2 py-0.5 rounded-full bg-pla-accent/15 text-pla-accent">
          {PHASE_LABELS[workflowPhase]}
        </span>
        {workflowPhase !== 'intro' && (
          <DebugToolbar
            phase={workflowPhase}
            onSkipPhase={handleSkipPhase}
            loading={loading}
          />
        )}
      </header>

      {workflowPhase === 'intro' ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-lg h-[min(620px,82vh)] flex flex-col rounded-2xl border border-pla-border bg-pla-panel/50 shadow-xl shadow-black/20 overflow-hidden">
            <IntroPanel
              projects={PRESET_PROJECTS}
              selectedId={selectedProjectId}
              onSelect={setSelectedProjectId}
              onStart={handleProjectStart}
              canStart={canSubmit}
            />
          </div>
        </div>
      ) : workflowPhase === 'project_analysis' ? (
        <div className="flex-1 flex min-h-0">
          {presetOutput && (
            <>
              <div className="flex-[3] min-w-0 min-h-0 overflow-hidden">
                <ProjectAnalysisStepPanel
                  taskSummary={presetOutput.task_summary}
                  planItem={currentPlanItem}
                  task={currentAnalysisTask}
                  stepIndex={analysisStepIndex}
                  stepTotal={planTotal}
                />
              </div>
              <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
                <InteractionPanel
                  questions={socraticQuestions}
                  socraticAnswers={socraticAnswers}
                  onSocraticAnswerChange={handleSocraticAnswerChange}
                  onSkipQuestion={handleSkipQuestion}
                  messages={messages}
                  terms={presetOutput.terms || []}
                  loading={loading}
                  chatInput={chatInput}
                  onChatInputChange={setChatInput}
                  onSubmit={handleSubmit}
                  canSubmit={canSubmit}
                  mode="analysis"
                  layout="sidebar"
                  onNextAnalysisStep={handleAnalysisNextStep}
                  onPrevAnalysisStep={handleAnalysisPrevStep}
                  canPrevAnalysisStep={analysisStepIndex > 1}
                  nextAnalysisStepLabel={analysisNextLabel}
                />
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex-1 flex min-h-0">
            {showReferenceSidebar && presetOutput && (
              <div className="w-44 shrink-0 border-r border-pla-border min-h-0 overflow-hidden">
                <ReferenceSidebar
                  taskSummary={presetOutput.task_summary}
                  logicPlan={presetOutput.logic_plan}
                  executionSteps={presetOutput.execution_steps}
                  showSteps={workflowPhase === 'code_design'}
                />
              </div>
            )}

            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {showMainSteps && (
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ExecutionStepsPanel
                    visibleGroups={visibleOperationGroups}
                    activeSubKey={activeSubKey}
                    onSelectSubStep={handleSelectSubStep}
                    totalSubStepCount={stepTotal}
                    revealedSubStepCount={revealedStepCount}
                    awaitingContent={stepTotal === 0}
                    waitingForQuestion={stepTotal > 0 && revealedStepCount === 0}
                    pendingHint={operationDescPendingHint}
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
              onSkipQuestion={handleSkipQuestion}
              messages={messages}
              terms={presetOutput?.terms || []}
              loading={loading}
              chatInput={chatInput}
              onChatInputChange={setChatInput}
              onSubmit={handleSubmit}
              canSubmit={canSubmit}
              mode="split"
              onNextAnalysisStep={handleAnalysisNextStep}
              onPrevAnalysisStep={handleAnalysisPrevStep}
              canPrevAnalysisStep={analysisStepIndex > 1}
              nextAnalysisStepLabel={analysisNextLabel}
            />
          </div>
        </>
      )}
    </div>
  )
}
