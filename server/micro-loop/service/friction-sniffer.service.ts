import { redactSecretsInText, scrubHeldSecrets } from "../../redact.ts";
import {
  computeContextHash,
  computeEventId,
  computeFrictionFingerprint,
  signFrictionEvent,
  type FrictionEventPayload,
  type FrictionSignalKind,
  type MicroLoopDomain,
  type SignedFrictionEvent,
} from "../contracts/friction-event.schema.ts";
import type { IFrictionLedgerPort } from "../contracts/ports.ts";
import { loadMicroLoopConfig } from "../config/micro-loop.config.ts";
import { FrictionLedgerRepo } from "../repo/friction-ledger.repo.ts";

const EXPLICIT_CORRECTION_PATTERNS = [
  /不要/i,
  /别再/i,
  /以后先/i,
  /严禁/i,
  /搞错了/i,
  /不是这样/i,
  /改用/i,
  /换成/i,
  /切记/i,
  /\bdo not\b/i,
  /\bdon'?t\b/i,
  /\bnever\b/i,
  /\binstead of\b/i,
  /\balways\s+[\w\s-]+\s+first\b/i,
  /\bstop doing\b/i,
  /\bwrong\b/i,
  /\bincorrect\b/i,
  /\buse\s+[\w\s-]+\s+instead\b/i,
];

const CHAT_EXCLUSIONS = [
  /不要紧/i,
  /不是吧/i,
  /别客气/i,
  /别担心/i,
  /no problem/i,
  /don't worry/i,
];

export function sanitizeText(text: string, maxLength: number): string {
  const scrubbed = scrubHeldSecrets(redactSecretsInText(text));
  return scrubbed.slice(0, maxLength).trim();
}

export function matchesExplicitCorrection(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 4 || trimmed.length > 2000) return false;
  for (const exclusion of CHAT_EXCLUSIONS) {
    if (exclusion.test(trimmed)) return false;
  }
  return EXPLICIT_CORRECTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function extractNormalizedIntentKey(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 120);
}

export interface SnifferOptions {
  ledgerRepo: IFrictionLedgerPort;
  hmacSecret?: string;
  defaultRepoSlug?: string;
  defaultProducerModel?: string;
}

export class FrictionSnifferService {
  private readonly ledger: IFrictionLedgerPort;
  private readonly secret: string;
  private readonly defaultRepoSlug: string;
  private readonly defaultProducerModel: string;

  constructor(options: SnifferOptions) {
    this.ledger = options.ledgerRepo;
    const config = loadMicroLoopConfig();
    this.secret = options.hmacSecret || config.hmacSecret;
    this.defaultRepoSlug = options.defaultRepoSlug || "openmausbot-workspace";
    this.defaultProducerModel = options.defaultProducerModel || "gemini-3.8-flash";
  }

  isExplicitCorrection(text: string): boolean {
    return matchesExplicitCorrection(text);
  }

  private async buildAndRecordEvent(input: {
    signalKind: FrictionSignalKind;
    botId: string;
    threadId: string;
    correctionPromptRaw: string;
    failedOutputRaw: string;
    repoSlug?: string;
    domain?: MicroLoopDomain;
    producerModel?: string;
    contextTags?: string[];
    normalizedIntentKey?: string;
  }): Promise<SignedFrictionEvent | null> {
    try {
      const correctionPrompt = sanitizeText(input.correctionPromptRaw, 1200);
      const failedOutput = sanitizeText(input.failedOutputRaw, 4000);
      if (!correctionPrompt) return null;

      const domain: MicroLoopDomain = input.domain || "Shared";
      const repoSlug = (input.repoSlug || this.defaultRepoSlug).replace(/[^a-zA-Z0-9._/-]/g, "-").slice(0, 120);
      const contextTags = (input.contextTags || []).map((t) => t.trim().slice(0, 48)).filter(Boolean).slice(0, 8);
      const timestamp = new Date().toISOString();
      const producerModel = input.producerModel || this.defaultProducerModel;

      const contextHash = computeContextHash({
        repo_slug: repoSlug,
        domain,
        failed_output_normalized: failedOutput,
        context_tags: contextTags,
      });

      const intentKey = input.normalizedIntentKey || extractNormalizedIntentKey(correctionPrompt);
      const fingerprintId = computeFrictionFingerprint({
        repo_slug: repoSlug,
        domain,
        normalized_intent_key: intentKey,
      });

      const eventId = computeEventId({
        bot_id: input.botId,
        thread_id: input.threadId,
        context_hash: contextHash,
        signal_kind: input.signalKind,
        timestamp,
      });

      const payload: FrictionEventPayload = {
        schema_version: "3.0",
        event_id: eventId,
        fingerprint_id: fingerprintId,
        context_hash: contextHash,
        correction_prompt: correctionPrompt,
        failed_output: failedOutput || "[EMPTY_OUTPUT]",
        timestamp,
        repo_slug: repoSlug,
        signal_kind: input.signalKind,
        bot_id: input.botId,
        thread_id: input.threadId,
        domain,
        producer_model: producerModel,
        context_tags: contextTags,
      };

      const signed = signFrictionEvent(payload, this.secret);
      await this.ledger.appendEvent(signed);
      return signed;
    } catch {
      // Sniffer never throws into caller
      return null;
    }
  }

  async sniffExplicitCorrection(params: {
    botId: string;
    threadId: string;
    userText: string;
    prevAssistantMsgText?: string;
    repoSlug?: string;
    domain?: MicroLoopDomain;
    producerModel?: string;
    contextTags?: string[];
  }): Promise<SignedFrictionEvent | null> {
    if (!this.isExplicitCorrection(params.userText)) {
      return null;
    }
    return this.buildAndRecordEvent({
      signalKind: "explicit_correction",
      botId: params.botId,
      threadId: params.threadId,
      correctionPromptRaw: params.userText,
      failedOutputRaw: params.prevAssistantMsgText || "",
      repoSlug: params.repoSlug,
      domain: params.domain,
      producerModel: params.producerModel,
      contextTags: params.contextTags,
    });
  }

  async sniffUndo(params: {
    botId: string;
    threadId: string;
    requestId: string;
    actionSummary?: string;
    repoSlug?: string;
    domain?: MicroLoopDomain;
    producerModel?: string;
  }): Promise<SignedFrictionEvent | null> {
    return this.buildAndRecordEvent({
      signalKind: "implicit_undo",
      botId: params.botId,
      threadId: params.threadId,
      correctionPromptRaw: `[IMPLICIT_UNDO] requestId=${params.requestId}`,
      failedOutputRaw: params.actionSummary || `Action undone for request ${params.requestId}`,
      repoSlug: params.repoSlug,
      domain: params.domain,
      producerModel: params.producerModel,
      normalizedIntentKey: `undo-request-${params.requestId}`,
    });
  }

  async sniffEditRetry(params: {
    botId: string;
    threadId: string;
    editedText: string;
    abandonedAssistantMsgText?: string;
    repoSlug?: string;
    domain?: MicroLoopDomain;
    producerModel?: string;
  }): Promise<SignedFrictionEvent | null> {
    return this.buildAndRecordEvent({
      signalKind: "implicit_edit_retry",
      botId: params.botId,
      threadId: params.threadId,
      correctionPromptRaw: params.editedText,
      failedOutputRaw: params.abandonedAssistantMsgText || "[ABANDONED_BRANCH_OUTPUT]",
      repoSlug: params.repoSlug,
      domain: params.domain,
      producerModel: params.producerModel,
    });
  }

  async sniffThumbsDown(params: {
    botId: string;
    threadId: string;
    targetAssistantMsgText: string;
    repoSlug?: string;
    domain?: MicroLoopDomain;
    producerModel?: string;
  }): Promise<SignedFrictionEvent | null> {
    return this.buildAndRecordEvent({
      signalKind: "implicit_thumbs_down",
      botId: params.botId,
      threadId: params.threadId,
      correctionPromptRaw: "[IMPLICIT_THUMBS_DOWN]",
      failedOutputRaw: params.targetAssistantMsgText || "[DISLIKED_MESSAGE]",
      repoSlug: params.repoSlug,
      domain: params.domain,
      producerModel: params.producerModel,
      normalizedIntentKey: "thumbs-down-feedback",
    });
  }
}

let globalSniffer: FrictionSnifferService | null = null;

export function getGlobalFrictionSniffer(): FrictionSnifferService {
  if (!globalSniffer) {
    globalSniffer = new FrictionSnifferService({
      ledgerRepo: new FrictionLedgerRepo(),
    });
  }
  return globalSniffer;
}

