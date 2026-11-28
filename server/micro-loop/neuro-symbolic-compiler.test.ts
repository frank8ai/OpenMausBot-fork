import { describe, expect, it } from "vitest";
import {
  classifyCompileTarget,
  compileFrictionCluster,
  renderBoundedTailSkillCard,
} from "./service/neuro-symbolic-compiler.service.ts";
import type { SignedFrictionEvent } from "./contracts/friction-event.schema.ts";

describe("Neuro-Symbolic Compiler Service", () => {
  function makeEvent(prompt: string, failed: string, tags: string[] = []): SignedFrictionEvent {
    return {
      schema_version: "3.0",
      event_id: "0".repeat(64),
      fingerprint_id: "1234567890abcdef",
      context_hash: "f".repeat(64),
      correction_prompt: prompt,
      failed_output: failed,
      timestamp: new Date().toISOString(),
      repo_slug: "my-org/my-repo",
      signal_kind: "explicit_correction",
      bot_id: "bot-dev",
      thread_id: "thread-001",
      domain: "Infra",
      producer_model: "claude-3-7-sonnet",
      context_tags: tags,
      hmac_sha256: "e".repeat(64),
    };
  }

  it("classifies deterministic rules as SYMBOLIC_SCRIPT_0TOKEN and semantic rules as PROMPT_SKILL_BOUNDED", () => {
    const gitEvent = makeEvent("不要直接 push 到 main 分支，必须先 rebase", "git push origin main");
    expect(classifyCompileTarget([gitEvent])).toBe("SYMBOLIC_SCRIPT_0TOKEN");

    const schemaEvent = makeEvent("修改 regex 校验逻辑，保证 json schema 验证通过", "invalid format");
    expect(classifyCompileTarget([schemaEvent])).toBe("SYMBOLIC_SCRIPT_0TOKEN");

    const semanticEvent = makeEvent("回复时语气要更加亲切自然一些", "Here is your response.");
    expect(classifyCompileTarget([semanticEvent])).toBe("PROMPT_SKILL_BOUNDED");
  });

  it("compiles friction cluster into valid draft with 0 tokens for symbolic script", () => {
    const events = [
      makeEvent("不要直接强推到 main 分支", "git push -f origin main", ["git", "push"]),
    ];

    const result = compileFrictionCluster(events);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.draft.compile_target).toBe("SYMBOLIC_SCRIPT_0TOKEN");
    expect(result.draft.estimated_tokens).toBe(0);
    expect(result.draft.script_body).toBeDefined();
    expect(result.draft.exclusion_boundaries.length).toBeGreaterThanOrEqual(1);
    expect(result.draft.contrastive_probes.length).toBeGreaterThanOrEqual(2);
  });

  it("compiles semantic rules into PROMPT_SKILL_BOUNDED with <= 400 tokens and rendered skill markdown", () => {
    const events = [
      makeEvent("文案措辞更接地气一些，多使用口语化表达", "正式官方发言致辞", ["copywriting"]),
    ];

    const result = compileFrictionCluster(events);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.draft.compile_target).toBe("PROMPT_SKILL_BOUNDED");
    expect(result.draft.estimated_tokens).toBeLessThanOrEqual(400);
    expect(result.draft.rendered_skill_md).toBeDefined();
    expect(result.draft.rendered_skill_md).toContain("DO NOT");
    expect(result.draft.rendered_skill_md).toContain("EXCLUDED WHEN");
  });

  it("renders bounded tail skill card adhering strictly to inhibitory-first ordering", () => {
    const card = renderBoundedTailSkillCard({
      schema_version: "3.0",
      slug: "ml-sample-skill",
      fingerprint_id: "abcdef1234567890",
      domain: "Shared",
      compile_target: "PROMPT_SKILL_BOUNDED",
      producer_model: "gemini-3.8-flash",
      error_class: "SAMPLE_ERROR",
      pre_conditions: ["When executing database migrations"],
      positive_directives: ["Always dry-run first", "Backup schema"],
      exclusion_boundaries: ["Do not apply on ephemeral SQLite in-memory databases"],
      inhibits_patterns: ["Never drop tables directly"],
      condition_tags: ["db"],
      contrastive_probes: [
        {
          case_id: "pos",
          kind: "positive_transfer",
          description: "dry run",
          command: "bun -e \"process.exit(0)\"",
          expected_exit_code: 0,
        },
        {
          case_id: "neg",
          kind: "boundary_negative",
          description: "direct drop",
          command: "bun -e \"process.exit(1)\"",
          expected_exit_code: 1,
        },
      ],
      estimated_tokens: 120,
      created_at_iso: new Date().toISOString(),
    });

    const doNotIdx = card.indexOf("**DO NOT:**");
    const excludedWhenIdx = card.indexOf("**EXCLUDED WHEN:**");
    const preCondIdx = card.indexOf("**PRE-CONDITIONS:**");
    const directivesIdx = card.indexOf("**DIRECTIVES:**");

    expect(doNotIdx).toBeGreaterThan(-1);
    expect(excludedWhenIdx).toBeGreaterThan(doNotIdx);
    expect(preCondIdx).toBeGreaterThan(excludedWhenIdx);
    expect(directivesIdx).toBeGreaterThan(preCondIdx);
  });
});
