# Playwright Sandbox Harness Specification (微软 Playwright 零 Flaky 沙盒规范)

## 1. 零 Flaky 核心配置基线 (`playwright.config.ts`)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/summary.json' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
});
```

## 2. 确定性定位器黄金准则 (Locator Hierarchy)

1. **Top 1: `page.getByRole(role, { name })`**:
   - 紧密贴合无障碍树（Accessibility Tree），对用户可见体验负责。
2. **Top 2: `page.getByTestId('action-submit')`**:
   - 专用测试锚点，彻底隔离视觉重构与样式改动影响。
3. **严禁使用**:
   - 绝对 XPath (`/html/body/div[2]/div[1]/button`)
   - 自动生成的混淆类名 (`.Button__StyledBtn-sc-1324`)
