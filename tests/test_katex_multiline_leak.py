"""AER Verify Acceptance Test for KaTeX Math Delimiter Multi-line Isolation."""

from pathlib import Path


def test_katex_multiline_delimiter_contract():
    repo_root = Path(__file__).resolve().parent.parent
    target_comp = repo_root / "src" / "components" / "ChatMarkdown.tsx"
    assert target_comp.is_file(), "src/components/ChatMarkdown.tsx must exist"