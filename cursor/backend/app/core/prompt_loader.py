"""Load LLM prompt templates from ``prompt/`` at the PLA repo root."""

from pathlib import Path

# backend/app/core/prompt_loader.py → PLA 根目录 (cursor/)
_PLA_ROOT = Path(__file__).resolve().parents[3]
PROMPT_DIR = _PLA_ROOT / "prompt"


def load_prompt_text(path: Path) -> str:
    """Read a prompt file; strip outer whitespace."""
    return path.read_text(encoding="utf-8").strip()


def load_module_prompt(module: str, filename: str) -> str:
    """Load ``prompt/{module}/{filename}``."""
    path = PROMPT_DIR / module / filename
    if not path.is_file():
        raise FileNotFoundError(
            f"Prompt not found: {path.relative_to(_PLA_ROOT)} "
            f"(expected under prompt/)"
        )
    return load_prompt_text(path)
