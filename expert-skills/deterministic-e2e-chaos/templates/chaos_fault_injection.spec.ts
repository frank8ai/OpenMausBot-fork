/**
 * Production-Grade Netflix Chaos Injection Test Suite for Playwright
 * Demonstrating Latency Jitter, HTTP 429, Upstream 500 & Offline Recovery
 */
import { test, expect } from '@playwright/test';

test.describe('Netflix Chaos Resilience Harness', () => {

  test('CHAOS-01: 高延迟抖动下，系统必须展示骨架屏且防重复提交', async ({ page }) => {
    // 拦截支付结算请求，强制注入 2500ms 延迟
    await page.route('**/api/v1/checkout', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', transactionId: 'tx_chaos_delayed' }),
      });
    });

    await page.goto('/checkout');
    const submitBtn = page.getByRole('button', { name: /confirm payment/i });
    await submitBtn.click();

    // 稳态断言 1: 按钮必须处于 disabled 状态防重放
    await expect(submitBtn).toBeDisabled();
    // 稳态断言 2: 必须呈现加载骨架或 Spinner
    await expect(page.getByTestId('loading-spinner')).toBeVisible();

    // 最终稳态恢复断言
    await expect(page.getByText(/payment completed/i)).toBeVisible({ timeout: 5000 });
  });

  test('CHAOS-02: 突发 HTTP 429 限流时，客户端必须依据退避机制优雅提示', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/v1/data-sync', async (route) => {
      callCount++;
      if (callCount <= 2) {
        // 前两次注入 429 Too Many Requests
        await route.fulfill({
          status: 429,
          headers: { 'Retry-After': '1' },
          body: JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED' }),
        });
      } else {
        // 第三次恢复正常
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ synced: true }),
        });
      }
    });

    await page.goto('/dashboard');
    await page.getByRole('button', { name: /sync now/i }).click();

    // 稳态断言: 界面提示正在重试或排队，未发生未捕获白屏
    await expect(page.getByTestId('sync-status-badge')).toContainText(/sync/i);
    // 最终自愈变绿
    await expect(page.getByText(/sync completed/i)).toBeVisible({ timeout: 6000 });
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  test('CHAOS-03: 离线网络断开注入下，必须平滑切入离线模式并恢复', async ({ context, page }) => {
    await page.goto('/editor');

    // 注入网络切断
    await context.setOffline(true);

    const saveBtn = page.getByRole('button', { name: /save changes/i });
    await saveBtn.click();

    // 稳态断言: 出现黄色离线提示横幅
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    await expect(page.getByText(/working offline/i)).toBeVisible();

    // 恢复网络
    await context.setOffline(false);

    // 稳态恢复断言: 自动对账上传并消除横幅
    await expect(page.getByTestId('offline-banner')).toBeHidden({ timeout: 5000 });
    await expect(page.getByText(/all changes saved/i)).toBeVisible();
  });
});
