import { z } from "zod";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const FrictionSignalKindSchema = z.enum([
  "explicit_correction",
  "implicit_undo",
  "implicit_edit_retry",
  "implicit_thumbs_down",
]);
export type FrictionSignalKind = z.infer<typeof FrictionSignalKindSchema>;

export const MicroLoopDomainSchema = z.enum(["Infra", "Fulfill", "App", "Shared"]);
export type MicroLoopDomain = z.infer<typeof MicroLoopDomainSchema>;

/**
 * Phase C Canonical Friction Event Contract
 * 强制包含核心三元组 (context_hash, correction_prompt, failed_output) + timestamp + repo_slug
 */
export const FrictionEventPayloadSchema = z.object({
  schema_version: z.literal("3.0").default("3.0"),
  /** 幂等事件 ID：sha256(bot_id|thread_id|context_hash|signal_kind|timestamp_bucket_10s) */
  event_id: z.string().regex(/^[a-f0-9]{64}$/),
  /** 跨轮次聚类指纹（供 HRK Rule-of-2 聚合）：sha256(repo_slug|domain|normalized_intent_key) */
  fingerprint_id: z.string().regex(/^[a-f0-9]{16,64}$/),
  /** 核心三元组 #1：触发上下文规范化哈希（工具调用轨迹+文件路径+错误码摘要的 SHA-256） */
  context_hash: z.string().regex(/^[a-f0-9]{64}$/),
  /** 核心三元组 #2：经脱敏的用户纠偏指令或隐式否定载荷 */
  correction_prompt: z.string().min(1).max(1200),
  /** 核心三元组 #3：经脱敏的失败助手输出摘要 */
  failed_output: z.string().min(1).max(4000),
  /** ISO-8601 UTC 时间戳 */
  timestamp: z.string().datetime(),
  /** 关联项目仓库标识（如 "frank8ai-workspace/OpenMausBot" 或规范化本地目录 slug） */
  repo_slug: z.string().regex(/^[a-zA-Z0-9._/-]{1,120}$/),
  signal_kind: FrictionSignalKindSchema,
  bot_id: z.string().min(1).max(80),
  thread_id: z.string().min(1).max(120),
  domain: MicroLoopDomainSchema.default("Shared"),
  /** 产生该失败输出的源模型 ID，供 Tier-2 跨族盲审强制做同族隔离 (EXIT 30) */
  producer_model: z.string().min(1).max(120),
  /** 可选：关联的上下文标签（如 ["git", "rebase", "public-api"]），用于符号路由与稀疏检索 */
  context_tags: z.array(z.string().min(1).max(48)).max(8).default([]),
});
export type FrictionEventPayload = z.infer<typeof FrictionEventPayloadSchema>;

export const SignedFrictionEventSchema = FrictionEventPayloadSchema.extend({
  /** 使用本地主秘钥或 OMB_ORACLE_HMAC_SECRET / OMB_MICRO_LOOP_HMAC_SECRET 对规范化载荷计算的 HMAC-SHA256 */
  hmac_sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SignedFrictionEvent = z.infer<typeof SignedFrictionEventSchema>;

export function computeContextHash(input: {
  repo_slug: string;
  domain: MicroLoopDomain;
  failed_output_normalized: string;
  context_tags: readonly string[];
}): string {
  const canonical = JSON.stringify({
    d: input.domain,
    o: input.failed_output_normalized.slice(0, 1000).trim().toLowerCase(),
    r: input.repo_slug.toLowerCase(),
    t: [...input.context_tags].map((x) => x.toLowerCase()).sort(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function computeFrictionFingerprint(input: {
  repo_slug: string;
  domain: MicroLoopDomain;
  normalized_intent_key: string;
}): string {
  return createHash("sha256")
    .update(`${input.repo_slug.toLowerCase()}|${input.domain}|${input.normalized_intent_key.toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

export function computeEventId(input: {
  bot_id: string;
  thread_id: string;
  context_hash: string;
  signal_kind: FrictionSignalKind;
  timestamp: string;
}): string {
  const date = new Date(input.timestamp);
  const bucket = Math.floor(date.getTime() / 10000); // 10s bucket
  return createHash("sha256")
    .update(`${input.bot_id}|${input.thread_id}|${input.context_hash}|${input.signal_kind}|${bucket}`)
    .digest("hex");
}

export function canonicalizeFrictionPayload(payload: FrictionEventPayload): string {
  const keys = Object.keys(payload).sort() as Array<keyof FrictionEventPayload>;
  const ordered: Record<string, unknown> = {};
  for (const k of keys) {
    ordered[k] = payload[k];
  }
  return JSON.stringify(ordered);
}

export function signFrictionEvent(payload: FrictionEventPayload, secret: string): SignedFrictionEvent {
  const canonical = canonicalizeFrictionPayload(payload);
  const hmac_sha256 = createHmac("sha256", secret).update(canonical).digest("hex");
  return SignedFrictionEventSchema.parse({ ...payload, hmac_sha256 });
}

export function verifyFrictionEventHmac(event: SignedFrictionEvent, secret: string): boolean {
  const { hmac_sha256, ...payload } = event;
  const canonical = canonicalizeFrictionPayload(payload);
  const expectedHmac = createHmac("sha256", secret).update(canonical).digest("hex");
  if (
    typeof hmac_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(hmac_sha256)
  ) {
    return false;
  }
  const actualBuf = Buffer.from(hmac_sha256, "hex");
  const expectedBuf = Buffer.from(expectedHmac, "hex");
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(actualBuf, expectedBuf);
}

