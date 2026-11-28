import { z } from 'zod';

// ============================================================
// 1. Minimal output contract asked of the LLM (structured output)
//    (never includes telemetry / strikeCount / idempotencyKey / stats)
// ============================================================
export const SubBotLLMOutputSchema = z.object({
  outcome: z.enum(['COMPLETED', 'CONTRACT_CONFLICT']),
  outputData: z.record(z.string(), z.unknown()).optional(),
  conflictEvidence: z.string().max(1024).optional(), // only when an upstream contract contradicts itself
});

export type SubBotLLMOutput = z.infer<typeof SubBotLLMOutputSchema>;

// ============================================================
// 2. Scheduler in-memory DTOs (never JSON.stringify into a prompt; always go through PromptSerializer)
// ============================================================
export const ArtifactPointerSchema = z.object({
  id: z.string(), // short alias such as "ART-01"
  summary: z.string().max(160),
  uri: z.string(),
  sha256: z.string().length(64),
  lineRange: z.string().optional(),
});
export type ArtifactPointer = z.infer<typeof ArtifactPointerSchema>;

export const AcceptanceCriteriaSchema = z.object({
  outputSchemaName: z.string(),
  verifierType: z.enum(['CODE_TEST', 'SCHEMA_RULE', 'INDEPENDENT_CRITIC']),
  checks: z.array(z.string()).min(1),
});
export type AcceptanceCriteria = z.infer<typeof AcceptanceCriteriaSchema>;

export const ExecutionProfileSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('GENERAL'),
    draftNamespace: z.string(), // e.g. "drafts/task-01/research/attempt-1"
  }),
  z.object({
    kind: z.literal('ENGINEERING'),
    worktreePath: z.string(),
    branchName: z.string(),
    softDiffWarningLines: z.number().int().positive(), // T1:150, T2:400, T3:800 (soft warning only)
  }),
]);
export type ExecutionProfile = z.infer<typeof ExecutionProfileSchema>;

export const BotTaskEnvelopeV3Schema = z.object({
  // --- L1 shared prefix fields (identical across parallel siblings of one parent task) ---
  parentTaskId: z.string(),

  // --- Runtime-only metadata (memory only, never serialized into a prompt) ---
  expectedBlackboardVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string(), // format: `${subtaskId}:attempt-${attempt}`
  limits: z.object({
    maxExecutionTokens: z.number().int().positive(), // T1: 8k, T2: 16k, T3: 32k
    maxToolCalls: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
  }),

  // --- L2 volatile slice (placed after cache breakpoint #2) ---
  subtaskId: z.string(),
  attempt: z.union([z.literal(1), z.literal(2)]),
  tier: z.enum(['T1_FAST', 'T2_STANDARD', 'T3_CRITICAL']),
  goal: z.string().max(300),

  // Discriminated by domain: non-code bots carry no git scaffolding, code bots keep a hard worktree boundary
  executionProfile: ExecutionProfileSchema,

  // Deterministic high-signal context, one of four shapes (800-3500 tokens)
  context: z.object({
    upstreamSlices: z.record(z.string(), z.unknown()),
    contractRules: z.array(z.string()),
    forbiddenScope: z.array(z.string()),
    examples: z
      .object({
        good: z.string(),
        bad: z.string().optional(),
      })
      .optional(),
  }),

  // Keeps the real uri+sha256; PromptSerializer shows the model only { id, summary, lineRange }
  artifactPointers: z.array(ArtifactPointerSchema).optional(),

  // Acceptance gate (DoD); the model never grades a subjective gate itself
  acceptanceCriteria: AcceptanceCriteriaSchema,
});

export type BotTaskEnvelopeV3 = z.infer<typeof BotTaskEnvelopeV3Schema>;

// ============================================================
// 3. Full state delta the runtime harness assembles (for the blackboard, gates and telemetry)
// ============================================================
export const BotHandoffDeltaV3Schema = z.object({
  subtaskId: z.string(),
  idempotencyKey: z.string(),
  status: z.enum([
    'SUCCESS',
    'NEED_RETRY',        // Strike 1: local deterministic check failed; retry in place with the exact failing assertion
    'CONTRACT_CONFLICT', // upstream contract contradicts itself; pause cleanly and report the evidence
    'STALE_POINTER',     // tool layer saw an artifact hash change; refresh and re-dispatch (no strike)
    'CIRCUIT_BROKEN',    // Strike 2: two-strike circuit break; never let the same model guess a third time
  ]),
  strikeCount: z.union([z.literal(0), z.literal(1), z.literal(2)]),

  outputData: z.record(z.string(), z.unknown()).optional(),
  artifactUri: z.string().optional(),

  engineeringStats: z
    .object({
      filesChanged: z.number().int().nonnegative(),
      insertions: z.number().int().nonnegative(),
      deletions: z.number().int().nonnegative(),
      diffBudgetExceeded: z.boolean(), // soft warning only, never fails the task by itself
      patchUri: z.string().optional(),
    })
    .optional(),

  verification: z.object({
    passed: z.boolean(),
    verifierType: z.enum(['CODE_TEST', 'SCHEMA_RULE', 'INDEPENDENT_CRITIC']),
    summary: z.string().max(400),
  }),

  telemetry: z.object({
    durationMs: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheHitRate: z.number().min(0).max(1),
  }),

  diagnostics: z
    .object({
      errorSnippet: z.string().max(2048),
      conflictEvidence: z.string().max(1024).optional(),
      traceLogUri: z.string(),
    })
    .optional(),
});

export type BotHandoffDeltaV3 = z.infer<typeof BotHandoffDeltaV3Schema>;

// ============================================================
// 4. In-bot parallel subagent extension (v3.1)
// ============================================================
export const IntraBotSubagentEnvelopeSchema = BotTaskEnvelopeV3Schema.extend({
  invocationScope: z.literal('INTRA_SUBAGENT'),
  maxDepth: z.literal(1), // runtime check: the tool registry physically strips spawn-class tools
  isolationPolicy: z.discriminatedUnion('role', [
    z.object({
      role: z.literal('SCOUT'),
      allowFileWriteTools: z.literal(false),
    }),
    z.object({
      role: z.literal('VERIFIER'),
      allowFileWriteTools: z.literal(false),
      allowedCommandPrefixes: z.array(z.string()).min(1), // e.g. ['pnpm test', 'pnpm tsc', 'pnpm lint']
      isolatedEnv: z.record(z.string(), z.string()),    // e.g. { PORT: '0', TMPDIR: '...' }
    }),
    z.object({
      role: z.literal('DISJOINT_BUILDER'),
      allowedWritePrefixes: z.array(z.string()).min(1), // validated against the nearest ancestor realpath + path.sep
      forbiddenSharedFiles: z.array(z.string()),        // e.g. ['package.json', 'src/index.ts']
    }),
  ]),
});

export type IntraBotSubagentEnvelope = z.infer<typeof IntraBotSubagentEnvelopeSchema>;

export const IntraBotBatchRequestSchema = z.object({
  concurrencySlotLimit: z.number().int().min(1).max(5).default(4),
  cacheWarmup: z
    .object({
      enabled: z.boolean().default(true),
      waitForFirstTokenMsCap: z.number().int().max(3000).default(2500),
    })
    .default({ enabled: true, waitForFirstTokenMsCap: 2500 }),
  tasks: z.array(IntraBotSubagentEnvelopeSchema).min(1).max(10),
});

export type IntraBotBatchRequest = z.infer<typeof IntraBotBatchRequestSchema>;
