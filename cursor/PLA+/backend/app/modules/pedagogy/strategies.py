import re
from enum import Enum


class TeachingStrategy(str, Enum):
    explain = "explain"
    ground = "ground"
    demonstrate = "demonstrate"
    ask = "ask"
    hint = "hint"
    challenge = "challenge"
    verify = "verify"
    reflect = "reflect"
    advance = "advance"


STRATEGY_LABELS: dict[TeachingStrategy, str] = {
    TeachingStrategy.explain: "解释",
    TeachingStrategy.ground: "落地",
    TeachingStrategy.demonstrate: "演示",
    TeachingStrategy.ask: "提问",
    TeachingStrategy.hint: "提示",
    TeachingStrategy.challenge: "挑战",
    TeachingStrategy.verify: "验证",
    TeachingStrategy.reflect: "反思",
    TeachingStrategy.advance: "推进",
}

_RULES: list[tuple[re.Pattern[str], TeachingStrategy]] = [
    (re.compile(r"下一步|接下来|然后呢|继续学|推进|进入下一"), TeachingStrategy.advance),
    (re.compile(r"对不对|检查一下|验证|看看.*对吗|正确吗|有没有错"), TeachingStrategy.verify),
    (re.compile(r"提示|hint|卡住了|没思路|不知道怎么做|给点线索"), TeachingStrategy.hint),
    (re.compile(r"举个例子|示例|demo|示范|演示一下"), TeachingStrategy.demonstrate),
    (re.compile(r"什么是|解释|定义|什么意思|讲讲"), TeachingStrategy.explain),
    (re.compile(r"为什么|怎么理解|本质|原因|反思"), TeachingStrategy.reflect),
    (re.compile(r"如果我|假设|预测|试着改|挑战"), TeachingStrategy.challenge),
    (re.compile(r"在这个项目|本项目|我的项目|结合项目|落到项目"), TeachingStrategy.ground),
    (re.compile(r"你觉得|你认为|你怎么看|帮我理清"), TeachingStrategy.ask),
]


def select_strategy(
    question: str,
    *,
    has_profile: bool = False,
    experience_level: str = "beginner",
) -> TeachingStrategy:
    text = question.strip().lower()
    for pattern, strategy in _RULES:
        if pattern.search(text):
            return strategy

    if has_profile and experience_level == "beginner":
        if len(text) < 20 or "?" in text or "吗" in text or "怎么" in text:
            return TeachingStrategy.ask

    return TeachingStrategy.explain


def all_strategies() -> list[dict[str, str]]:
    return [
        {"id": s.value, "label": STRATEGY_LABELS[s]}
        for s in TeachingStrategy
    ]
