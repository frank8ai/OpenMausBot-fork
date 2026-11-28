import { z } from "zod";
import { MicroLoopDomainSchema } from "./friction-event.schema.ts";

export const CompileTargetSchema = z.enum([
  "SYMBOLIC_SCRIPT_0TOKEN",
  "PROMPT_SKILL_BOUNDED",
]);
export type CompileTarget = z.infer<typeof CompileTargetSchema>;

export const ContrastiveProbeKindSchema = z.enum([
  "positive_transfer",
  "near_miss_counterexample",
  "boundary_negative",
]);
export type ContrastiveProbeKind = z.infer<typeof ContrastiveProbeKindSchema>;

export const CompiledContrastiveProbeSchema = z.object({
  case_id: z.string().regex(/^[a-zA-Z0-9._-]{3,64}$/),
  kind: ContrastiveProbeKindSchema,
  description: z.string().min(5).max(200),
  command: z.string().min(3).max(500),
  expected_exit_code: z.number().int().min(0).max(255),
});
export type CompiledContrastiveProbe = z.infer<typeof CompiledContrastiveProbeSchema>;

export const CompiledRuleDraftSchema = z
  .object({
    schema_version: z.literal("3.0").default("3.0"),
    slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
    fingerprint_id: z.string().regex(/^[a-f0-9]{16,64}$/),
    domain: MicroLoopDomainSchema,
    compile_target: CompileTargetSchema,
    producer_model: z.string().min(1).max(120),
    error_class: z.string().min(1).max(120),
    /** 触发前提：1 ~ 3 条明确可检条件 */
    pre_conditions: z.array(z.string().min(5).max(200)).min(1).max(3),
    /** 正向执行指令：严格 <= 3 条（防认知膨胀） */
    positive_directives: z.array(z.string().min(5).max(240)).min(1).max(3),
    /** 强制负向排除边界（DO NOT / EXCLUDED WHEN）：>= 1 条，杜绝域外负迁移 */
    exclusion_boundaries: z.array(z.string().min(5).max(240)).min(1).max(5),
    /** 竞争性抑制旧错模式：>= 1 条 */
    inhibits_patterns: z.array(z.string().min(5).max(200)).min(1).max(4),
    /** 检索标签（供 HRK select-skills Jaccard 稀疏匹配） */
    condition_tags: z.array(z.string().min(1).max(48)).min(1).max(8),
    /** 0-Token 符号脚本主体（SYMBOLIC_SCRIPT_0TOKEN 必填） */
    script_language: z.enum(["node", "python", "ts"]).optional(),
    script_body: z.string().min(20).max(16_000).optional(),
    /** 渲染后的 Prompt Skill 文本（PROMPT_SKILL_BOUNDED 必填，硬上限 1600 chars ≈ 400 tokens） */
    rendered_skill_md: z.string().max(1600).optional(),
    /** 确定性正/反例对比探针（至少 1 正 + 1 负） */
    contrastive_probes: z.array(CompiledContrastiveProbeSchema).min(2).max(5),
    /** 预估运行时消耗 Token：符号脚本必须为 0，Prompt Skill <= 400 */
    estimated_tokens: z.number().int().min(0).max(400),
    created_at_iso: z.string().datetime(),
  })
  .superRefine((val, ctx) => {
    const hasPositive = val.contrastive_probes.some((p) => p.kind === "positive_transfer");
    const hasNegative = val.contrastive_probes.some(
      (p) => p.kind === "near_miss_counterexample" || p.kind === "boundary_negative",
    );
    if (!hasPositive) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MISSING_POSITIVE_TRANSFER_PROBE",
        path: ["contrastive_probes"],
      });
    }
    if (!hasNegative) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MISSING_NEGATIVE_EXCLUSION_PROBE",
        path: ["contrastive_probes"],
      });
    }
    if (val.compile_target === "SYMBOLIC_SCRIPT_0TOKEN") {
      if (!val.script_body || !val.script_language) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SYMBOLIC_SCRIPT_REQUIRES_BODY_AND_LANGUAGE",
          path: ["script_body"],
        });
      }
      if (val.estimated_tokens !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SYMBOLIC_SCRIPT_MUST_HAVE_ZERO_RUNTIME_TOKENS",
          path: ["estimated_tokens"],
        });
      }
    }
    if (val.compile_target === "PROMPT_SKILL_BOUNDED" && !val.rendered_skill_md) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PROMPT_SKILL_REQUIRES_RENDERED_MD",
        path: ["rendered_skill_md"],
      });
    }
  });
export type CompiledRuleDraft = z.infer<typeof CompiledRuleDraftSchema>;
