import { describe, expect, it, vi } from "vitest";
import {
  FrictionSnifferService,
  matchesExplicitCorrection,
  sanitizeText,
} from "./service/friction-sniffer.service.ts";
import type { IFrictionLedgerPort } from "./contracts/ports.ts";
import type { SignedFrictionEvent } from "./contracts/friction-event.schema.ts";

describe("Friction Sniffer Service", () => {
  const secret = "sniffer-test-secret-999";

  it("accurately detects explicit corrections in Chinese and English and filters small talk", () => {
    // Chinese corrections
    expect(matchesExplicitCorrection("不要直接推送到 main 分支")).toBe(true);
    expect(matchesExplicitCorrection("搞错了，应该是从 develop 拉取")).toBe(true);
    expect(matchesExplicitCorrection("严禁直接运行未经测试的脚本")).toBe(true);
    expect(matchesExplicitCorrection("以后先执行 typecheck 再提交")).toBe(true);
    expect(matchesExplicitCorrection("不是这样算的，税率是 6%")).toBe(true);

    // English corrections
    expect(matchesExplicitCorrection("do not delete production tables")).toBe(true);
    expect(matchesExplicitCorrection("don't hardcode credentials")).toBe(true);
    expect(matchesExplicitCorrection("never use any in TypeScript definitions")).toBe(true);
    expect(matchesExplicitCorrection("always run tests first")).toBe(true);
    expect(matchesExplicitCorrection("use pnpm instead of npm")).toBe(true);

    // Filtered small talk
    expect(matchesExplicitCorrection("不要紧的，慢慢来")).toBe(false);
    expect(matchesExplicitCorrection("不是吧这也太强了")).toBe(false);
    expect(matchesExplicitCorrection("don't worry about it")).toBe(false);
    expect(matchesExplicitCorrection("no problem")).toBe(false);
    expect(matchesExplicitCorrection("hi")).toBe(false); // < 4 chars
  });

  it("redacts secrets from prompts and failed outputs before signing", () => {
    const rawWithKey = "Do not reveal sk-ant-api03-12345678901234567890 or bearer tokens";
    const sanitized = sanitizeText(rawWithKey, 1200);
    expect(sanitized).not.toContain("sk-ant-api03-12345678901234567890");
    expect(sanitized).toContain("«redacted");
  });

  it("sniffs explicit correction, produces valid signed event and calls ledger", async () => {
    const appended: SignedFrictionEvent[] = [];
    const mockLedger: IFrictionLedgerPort = {
      appendEvent: vi.fn(async (event: SignedFrictionEvent) => {
        appended.push(event);
        return { written: true, deduplicated: false, path: "/tmp/fake.jsonl" };
      }),
      listEventsByFingerprint: vi.fn().mockResolvedValue([]),
      saveCompiledDraft: vi.fn().mockResolvedValue({ draftDir: "/tmp/drafts" }),
    };

    const sniffer = new FrictionSnifferService({
      ledgerRepo: mockLedger,
      hmacSecret: secret,
      defaultRepoSlug: "test/repo",
      defaultProducerModel: "claude-3-7-sonnet",
    });

    const event = await sniffer.sniffExplicitCorrection({
      botId: "bot-coder",
      threadId: "thread-abc",
      userText: "不要直接使用 any 类型，使用 unknown 替代",
      prevAssistantMsgText: "const data: any = JSON.parse(res);",
      domain: "Shared",
    });

    expect(event).not.toBeNull();
    expect(event?.signal_kind).toBe("explicit_correction");
    expect(event?.bot_id).toBe("bot-coder");
    expect(event?.producer_model).toBe("claude-3-7-sonnet");
    expect(event?.hmac_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(mockLedger.appendEvent).toHaveBeenCalledTimes(1);
  });

  it("sniffs implicit undo, edit retry, and thumbs down signals", async () => {
    const appended: SignedFrictionEvent[] = [];
    const mockLedger: IFrictionLedgerPort = {
      appendEvent: vi.fn(async (event: SignedFrictionEvent) => {
        appended.push(event);
        return { written: true, deduplicated: false, path: "/tmp/fake.jsonl" };
      }),
      listEventsByFingerprint: vi.fn().mockResolvedValue([]),
      saveCompiledDraft: vi.fn().mockResolvedValue({ draftDir: "/tmp/drafts" }),
    };

    const sniffer = new FrictionSnifferService({
      ledgerRepo: mockLedger,
      hmacSecret: secret,
    });

    // Undo
    const undoEv = await sniffer.sniffUndo({
      botId: "bot-coder",
      threadId: "thread-1",
      requestId: "req-999",
      actionSummary: "Dropped database table",
    });
    expect(undoEv?.signal_kind).toBe("implicit_undo");
    expect(undoEv?.correction_prompt).toContain("[IMPLICIT_UNDO]");

    // Edit Retry
    const editEv = await sniffer.sniffEditRetry({
      botId: "bot-coder",
      threadId: "thread-1",
      editedText: "Rewrite this using functional programming",
      abandonedAssistantMsgText: "class ObjectOrientedImplementation {}",
    });
    expect(editEv?.signal_kind).toBe("implicit_edit_retry");
    expect(editEv?.correction_prompt).toBe("Rewrite this using functional programming");

    // Thumbs down
    const thumbsEv = await sniffer.sniffThumbsDown({
      botId: "bot-coder",
      threadId: "thread-1",
      targetAssistantMsgText: "Here is an incorrect answer",
    });
    expect(thumbsEv?.signal_kind).toBe("implicit_thumbs_down");
    expect(thumbsEv?.correction_prompt).toBe("[IMPLICIT_THUMBS_DOWN]");

    expect(mockLedger.appendEvent).toHaveBeenCalledTimes(3);
  });
});

