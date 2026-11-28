/**
 * Production-Grade Hermetic Isolation Test Template
 * Aligned with Anthropic / OpenAI Fullstack Engineering Standards
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 待测试的目标服务接口与实现
interface PaymentGateway {
  charge(amountCents: number, currency: string, idempotencyKey: string): Promise<{ transactionId: string; status: 'settled' | 'failed' }>;
}

class OrderProcessor {
  constructor(private readonly gateway: PaymentGateway) {}

  async checkout(orderId: string, amountCents: number, currency: string): Promise<{ success: boolean; txId?: string; error?: string }> {
    if (amountCents <= 0) {
      throw new Error('INVALID_AMOUNT: Amount must be greater than zero');
    }
    const idempotencyKey = `order_${orderId}_${amountCents}`;
    try {
      const res = await this.gateway.charge(amountCents, currency, idempotencyKey);
      return { success: res.status === 'settled', txId: res.transactionId };
    } catch (err: any) {
      return { success: false, error: err.message || 'PAYMENT_FAILED' };
    }
  }
}

describe('OrderProcessor Hermetic Isolation Spec (TDD Red-Green Demo)', () => {
  let mockGateway: PaymentGateway;
  let processor: OrderProcessor;

  beforeEach(() => {
    // 1. 完全密封的 Mock 隔离，零外部网络与真实数据库依赖
    mockGateway = {
      charge: vi.fn(),
    };
    processor = new OrderProcessor(mockGateway);
  });

  afterEach(() => {
    // 2. 彻底清理状态
    vi.restoreAllMocks();
  });

  it('RED -> GREEN: 应当使用确定的幂等键执行充值并结算成功', async () => {
    // 给定确定性契约桩
    vi.mocked(mockGateway.charge).mockResolvedValueOnce({
      transactionId: 'tx_hermetic_999888',
      status: 'settled',
    });

    const result = await processor.checkout('ord_1001', 5000, 'USD');

    // 强断言验证
    expect(result.success).toBe(true);
    expect(result.txId).toBe('tx_hermetic_999888');
    expect(mockGateway.charge).toHaveBeenCalledWith(5000, 'USD', 'order_ord_1001_5000');
    expect(mockGateway.charge).toHaveBeenCalledTimes(1);
  });

  it('RED -> GREEN: 非法金额必须直接抛出结构化错误，绝不发起网关调用', async () => {
    await expect(processor.checkout('ord_invalid', -10, 'USD')).rejects.toThrow('INVALID_AMOUNT');
    expect(mockGateway.charge).not.toHaveBeenCalled();
  });
});
