# 连续物理弹簧动力学与初速度继承规范 (Continuous Physics Springs via RK4 & Velocity Transfer)

## 1. 物理模型与微分方程
标准阻尼简谐振子二阶常微分方程 (2nd-Order Damped Harmonic Oscillator):
$$m \frac{d^2x}{dt^2} + c \frac{dx}{dt} + k (x - x_{\text{target}}) = 0$$

其中参数定义与硅谷顶级交互系统映射：
- $m$ (质量 Mass, 默认 1.0)
- $k$ (刚度 Stiffness, 响应速度, 常用区间: 180 ~ 380)
- $c$ (阻尼 Damping, 摩擦消耗, 临界阻尼 $c_c = 2\sqrt{km}$, 常用阻尼比 $\zeta = \frac{c}{c_c} \approx 0.82 \sim 0.95$)
- $x_{\text{target}}$ (稳态目标位置)

## 2. 状态向量与四阶龙格-库塔 (RK4) 求解器
将二阶 ODE 降阶为状态向量 $\mathbf{S}(t) = [x(t), v(t)]^T$：
$$\frac{d\mathbf{S}}{dt} = f(t, \mathbf{S}) = \begin{bmatrix} v \\ -\frac{k}{m}(x - x_{\text{target}}) - \frac{c}{m}v \end{bmatrix}$$

在离散时间步长 $\Delta t$ (推荐固定步长 1ms ~ 4ms, 解耦帧率抖动) 下的 RK4 积分迭代：
$$\begin{aligned}
\mathbf{k}_1 &= f(t, \mathbf{S}_n) \\
\mathbf{k}_2 &= f(t + \frac{\Delta t}{2}, \mathbf{S}_n + \frac{\Delta t}{2} \mathbf{k}_1) \\
\mathbf{k}_3 &= f(t + \frac{\Delta t}{2}, \mathbf{S}_n + \frac{\Delta t}{2} \mathbf{k}_2) \\
\mathbf{k}_4 &= f(t + \Delta t, \mathbf{S}_n + \Delta t \mathbf{k}_3) \\
\mathbf{S}_{n+1} &= \mathbf{S}_n + \frac{\Delta t}{6} (\mathbf{k}_1 + 2\mathbf{k}_2 + 2\mathbf{k}_3 + \mathbf{k}_4)
\end{aligned}$$

## 3. 随时可打断与动量连续守恒 (Interruptibility & Momentum Continuity)
- **绝对禁忌**：当交互被新手势或光标打断时，严禁将速度重置为 0，严禁发生位置突变（Jump）。
- **动量继承契约**：
  $$x_{\text{initial}}^{\text{new}} = x(t_{\text{interrupt}})$$
  $$v_{\text{initial}}^{\text{new}} = v(t_{\text{interrupt}}) + v_{\text{pointer}}$$
  系统保持加速度曲线二次可导 ($C^2$ 连续性)，消除人眼察觉的微抖动。

```typescript
export interface SpringConfig {
  stiffness: number; // k
  damping: number;   // c
  mass?: number;     // m, 默认 1
  precision?: number;// 截断静止阈值, 默认 0.001
}

export class ContinuousSpringSolver {
  private x: number;
  private v: number;
  private target: number;
  private k: number;
  private c: number;
  private m: number;
  private precision: number;

  constructor(initial: number, config: SpringConfig) {
    this.x = initial;
    this.v = 0;
    this.target = initial;
    this.k = config.stiffness;
    this.c = config.damping;
    this.m = config.mass ?? 1;
    this.precision = config.precision ?? 0.0005;
  }

  public setTarget(newTarget: number, injectVelocity: number = 0): void {
    this.target = newTarget;
    this.v += injectVelocity; // 无缝继承用户拖拽初速度
  }

  public step(dt: number): { position: number; velocity: number; isSettled: boolean } {
    const f = (x: number, v: number): [number, number] => {
      const a = (-this.k * (x - this.target) - this.c * v) / this.m;
      return [v, a];
    };

    const [dx1, dv1] = f(this.x, this.v);
    const [dx2, dv2] = f(this.x + dx1 * dt * 0.5, this.v + dv1 * dt * 0.5);
    const [dx3, dv3] = f(this.x + dx2 * dt * 0.5, this.v + dv2 * dt * 0.5);
    const [dx4, dv4] = f(this.x + dx3 * dt, this.v + dv3 * dt);

    this.x += (dt / 6) * (dx1 + 2 * dx2 + 2 * dx3 + dx4);
    this.v += (dt / 6) * (dv1 + 2 * dv2 + 2 * dv3 + dv4);

    const isSettled = Math.abs(this.x - this.target) < this.precision && Math.abs(this.v) < this.precision;
    if (isSettled) {
      this.x = this.target;
      this.v = 0;
    }

    return { position: this.x, velocity: this.v, isSettled };
  }
}
```
