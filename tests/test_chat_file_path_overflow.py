"""AER Verify Acceptance Test for Chat Bubble and Attachment Chip Overflow Protection."""

from pathlib import Path


def test_chat_file_path_overflow_contract():
    repo_root = Path(__file__).resolve().parent.parent
    target_comp = repo_root / "src" / "components" / "AttachmentPreview.tsx"
    assert target_comp.is_file(), "src/components/AttachmentPreview.tsx must exist"
    content = target_comp.read_text(encoding="utf-8")
    assert "max-w-[min(280px,100%)]" in content, "AttachmentPreview must constrain chip max-width with min(280px,100%)"
    assert "sm:max-w-[280px]" not in content, "AttachmentPreview must not contain sm:max-w-[280px] collision"

    chat_comp = repo_root / "src" / "components" / "ChatMarkdown.tsx"
    assert chat_comp.is_file(), "src/components/ChatMarkdown.tsx must exist"
    chat_content = chat_comp.read_text(encoding="utf-8")
    assert "[overflow-wrap:anywhere]" in chat_content, "ChatMarkdown must contain [overflow-wrap:anywhere]"
    assert "break-all" in chat_content, "ChatMarkdown must contain break-all"