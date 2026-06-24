/** 项目解析某一步中，用户为完成内置项目而需做的工作（非向 AI 补充信息）。 */
export interface AnalysisStepTask {
  title: string
  /** 专业版：本步任务的规范表述 */
  summary: string
  /** 生动版：帮助初学者建立直觉的通俗说明 */
  summaryVivid: string
  /** 关联说明：将生动版比喻逐一对应到专业版术语 */
  summaryBridge: string
  /** 帮助初学者理解本步专业术语的简要说明 */
  termNotes: { term: string; note: string }[]
  /** 本步待完成的具体工作项 */
  actions: string[]
  /** 本步完成后应有的产出或检查点 */
  deliverables: string[]
  faq: { keywords: string[]; answer: string }[]
}
