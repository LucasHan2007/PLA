from app.modules.user_profiling.schema import MacroQuestion

MACRO_QUESTIONS: list[MacroQuestion] = [
    MacroQuestion(
        id="project_understanding",
        category="项目理解",
        question="用你自己的话描述：这个项目要做什么？输入是什么、输出是什么？",
        hint="不必专业术语，说出你的直觉理解即可。",
        placeholder="例如：读入手写数字图片，判断是 0–9 中的哪一个……",
    ),
    MacroQuestion(
        id="prior_programming",
        category="编程背景",
        question="你的编程经验如何？熟悉哪些语言、做过什么类型的项目？",
        hint="包括课程作业、自学小项目、实习经历等。",
        placeholder="例如：学过 Python 基础，写过简单的数据处理脚本……",
    ),
    MacroQuestion(
        id="prior_domain",
        category="领域知识",
        question="你对本项目涉及领域（如机器学习、Web、数据分析等）的了解程度？",
        hint="诚实说明学过什么、用过什么库或工具。",
        placeholder="例如：听说过神经网络，但没自己训练过模型……",
    ),
    MacroQuestion(
        id="learning_goal",
        category="学习目标",
        question="你希望通过这个项目达成什么学习目标？",
        hint="可以是技能、概念理解或作品集等。",
        placeholder="例如：理解分类任务完整流程，能独立跑通一个 baseline……",
    ),
    MacroQuestion(
        id="learning_style",
        category="学习偏好",
        question="你更偏好哪种学习方式？每天能投入多少时间？",
        hint="例如：先看例子再动手 / 先理解原理 / 喜欢小步练习。",
        placeholder="例如：每天 1–2 小时，喜欢边做边问、需要提示而非直接给答案……",
    ),
    MacroQuestion(
        id="concerns",
        category="顾虑与盲区",
        question="你最担心或觉得最陌生的部分是什么？",
        hint="数学推导、环境配置、调参、代码调试等都可以。",
        placeholder="例如：不太懂 loss 函数和反向传播，怕环境装不好……",
    ),
]


def get_question(question_id: str) -> MacroQuestion | None:
    return next((q for q in MACRO_QUESTIONS if q.id == question_id), None)


def question_ids() -> list[str]:
    return [q.id for q in MACRO_QUESTIONS]
