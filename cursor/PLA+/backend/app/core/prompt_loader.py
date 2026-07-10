"""Load LLM prompt templates from ``PLA+/prompt/`` (canonical source)."""

from pathlib import Path

# backend/app/core/prompt_loader.py → PLA+ 根目录
_PLA_PLUS_ROOT = Path(__file__).resolve().parents[3]
PROMPT_DIR = _PLA_PLUS_ROOT / "prompt"


def load_prompt_text(path: Path) -> str:
    """Read a prompt file; strip outer whitespace."""
    return path.read_text(encoding="utf-8").strip()


def load_module_prompt(module: str, filename: str) -> str:
    """Load ``PLA+/prompt/{module}/{filename}``."""
    path = PROMPT_DIR / module / filename
    if not path.is_file():
        raise FileNotFoundError(
            f"Prompt not found: {path.relative_to(_PLA_PLUS_ROOT)} "
            f"(expected under PLA+/prompt/)"
        )
    return load_prompt_text(path)
