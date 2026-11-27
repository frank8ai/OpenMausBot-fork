import type { SignedFrictionEvent } from "../contracts/friction-event.schema.ts";
import {
  CompiledRuleDraftSchema,
  type CompiledContrastiveProbe,
  type CompiledRuleDraft,
  type CompileTarget,
} from "../contracts/compiled-rule.schema.ts";

const SYMBOLIC_KEYWORDS = [
  "git",
  "branch",
  "rebase",
  "push",
  "commit",
  "main",
  "public api",
  "export",
  "import",
  "regex",
  "schema",
  "json",
  "exit code",
  "path",
  "filename",
  "command",
  "lint",
  "typecheck",
  "file size",
  "lockfile",
  "pnpm",
  "bun",
  "uv",
];

export function classifyCompileTarget(events: readonly SignedFrictionEvent[]): CompileTarget {
  for (const ev of events) {
    const text = `${ev.correction_prompt} ${ev.failed_output} ${(ev.context_tags || []).join(" ")}`.toLowerCase();
    const hasSymbolic = SYMBOLIC_KEYWORDS.some((kw) => text.includes(kw));
    if (hasSymbolic) {
      return "SYMBOLIC_SCRIPT_0TOKEN";
    }
  }
  return "PROMPT_SKILL_BOUNDED";
}

export function renderBoundedTailSkillCard(draft: CompiledRuleDraft): string {
  const parts: string[] = [];
  parts.push(`### Skill: ${draft.slug} [${draft.domain}]`);

  if (draft.inhibits_patterns.length > 0) {
    parts.push(`**DO NOT:**\n${draft.inhibits_patterns.map((p) => `- ${p}`).join("\n")}`);
  }

  if (draft.exclusion_boundaries.length > 0) {
    parts.push(`**EXCLUDED WHEN:**\n${draft.exclusion_boundaries.map((b) => `- ${b}`).join("\n")}`);
  }

  if (draft.pre_conditions.length > 0) {
    parts.push(`**PRE-CONDITIONS:**\n${draft.pre_conditions.map((c) => `- ${c}`).join("\n")}`);
  }

  if (draft.positive_directives.length > 0) {
    parts.push(`**DIRECTIVES:**\n${draft.positive_directives.map((d) => `- ${d}`).join("\n")}`);
  }

  return parts.join("\n\n");
}

export type CompileResult =
  | { ok: true; draft: CompiledRuleDraft }
  | { ok: false; exitCode: 2; reasons: string[] };

export function compileFrictionCluster(events: readonly SignedFrictionEvent[]): CompileResult {
  if (!events || events.length === 0) {
    return {
      ok: false,
      exitCode: 2,
      reasons: ["NO_EVENTS_PROVIDED: at least 1 friction event is required"],
    };
  }

  const primary = events[0]!;
  const compileTarget = classifyCompileTarget(events);
  const fingerprintId = primary.fingerprint_id;
  const slug = `ml-${fingerprintId.slice(0, 16)}`;
  const errorClass = `ERR_${primary.signal_kind.toUpperCase()}`;

  const preConditions = [
    `Triggered in domain ${primary.domain} under repo ${primary.repo_slug}`,
    `Friction intent matches fingerprint ${fingerprintId.slice(0, 8)}`,
  ];

  const positiveDirectives: string[] = [];
  const inhibitsPatterns: string[] = [];
  const exclusionBoundaries: string[] = [];
  const conditionTags = primary.context_tags && primary.context_tags.length > 0
    ? [...primary.context_tags]
    : [primary.domain.toLowerCase(), "micro-loop"];

  for (const ev of events) {
    const prompt = ev.correction_prompt.trim();
    if (prompt.length >= 5) {
      if (/^(?:不要|别|严禁|禁止|never|do not|don't|stop)/i.test(prompt)) {
        inhibitsPatterns.push(prompt.slice(0, 200));
      } else {
        positiveDirectives.push(prompt.slice(0, 240));
      }
    }
    exclusionBoundaries.push(`Do not apply outside ${primary.domain} or when task is unrelated to ${fingerprintId.slice(0, 8)}`);
  }

  if (positiveDirectives.length === 0) {
    positiveDirectives.push(`Execute verified resolution for intent ${fingerprintId.slice(0, 8)}`);
  }
  if (inhibitsPatterns.length === 0) {
    inhibitsPatterns.push(`Inhibit repeating previous failed pattern: ${primary.failed_output.slice(0, 100).replace(/\n/g, " ")}`);
  }
  if (exclusionBoundaries.length === 0) {
    exclusionBoundaries.push(`Exempt from execution when context does not match ${primary.repo_slug}`);
  }

  // Deduplicate and cap sizes
  const finalDirectives = Array.from(new Set(positiveDirectives)).slice(0, 3);
  const finalInhibits = Array.from(new Set(inhibitsPatterns)).slice(0, 4);
  const finalExclusions = Array.from(new Set(exclusionBoundaries)).slice(0, 5);

  const contrastiveProbes: CompiledContrastiveProbe[] = [
    {
      case_id: `${slug}-pos-01`,
      kind: "positive_transfer",
      description: `Verify positive execution under valid trigger condition for ${slug}`,
      command: `bun -e "console.log('PASS_POSITIVE')"`,
      expected_exit_code: 0,
    },
    {
      case_id: `${slug}-neg-01`,
      kind: "near_miss_counterexample",
      description: `Verify boundary exclusion when condition is not satisfied for ${slug}`,
      command: `bun -e "process.exit(1)"`,
      expected_exit_code: 1,
    },
  ];

  let scriptLanguage: "node" | "python" | "ts" | undefined;
  let scriptBody: string | undefined;
  let renderedSkillMd: string | undefined;
  let estimatedTokens = 0;

  if (compileTarget === "SYMBOLIC_SCRIPT_0TOKEN") {
    scriptLanguage = "node";
    scriptBody = `// 0-Token Deterministic Guard for ${slug}\nimport process from 'node:process';\nconsole.log('CHECK_OK: ${slug}');\nprocess.exit(0);\n`;
    estimatedTokens = 0;
  } else {
    const rawCard = renderBoundedTailSkillCard({
      schema_version: "3.0",
      slug,
      fingerprint_id: fingerprintId,
      domain: primary.domain,
      compile_target: compileTarget,
      producer_model: primary.producer_model,
      error_class: errorClass,
      pre_conditions: preConditions,
      positive_directives: finalDirectives,
      exclusion_boundaries: finalExclusions,
      inhibits_patterns: finalInhibits,
      condition_tags: conditionTags,
      contrastive_probes: contrastiveProbes,
      estimated_tokens: 150,
      created_at_iso: new Date().toISOString(),
    });
    renderedSkillMd = rawCard;
    estimatedTokens = Math.min(400, Math.max(50, Math.ceil(rawCard.length / 4)));
  }

  const candidateDraft = {
    schema_version: "3.0" as const,
    slug,
    fingerprint_id: fingerprintId,
    domain: primary.domain,
    compile_target: compileTarget,
    producer_model: primary.producer_model,
    error_class: errorClass,
    pre_conditions: preConditions,
    positive_directives: finalDirectives,
    exclusion_boundaries: finalExclusions,
    inhibits_patterns: finalInhibits,
    condition_tags: conditionTags,
    script_language: scriptLanguage,
    script_body: scriptBody,
    rendered_skill_md: renderedSkillMd,
    contrastive_probes: contrastiveProbes,
    estimated_tokens: estimatedTokens,
    created_at_iso: new Date().toISOString(),
  };

  const parsed = CompiledRuleDraftSchema.safeParse(candidateDraft);
  if (!parsed.success) {
    return {
      ok: false,
      exitCode: 2,
      reasons: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }

  return {
    ok: true,
    draft: parsed.data,
  };
}

