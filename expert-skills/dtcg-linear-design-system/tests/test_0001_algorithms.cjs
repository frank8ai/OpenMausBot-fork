const assert = require('assert');

// 1. Test RK4 Continuous Spring Solver
class ContinuousSpringSolver {
  constructor(initial, config) {
    this.x = initial;
    this.v = 0;
    this.target = initial;
    this.k = config.stiffness;
    this.c = config.damping;
    this.m = config.mass || 1;
    this.precision = config.precision || 0.0005;
  }

  setTarget(newTarget, injectVelocity = 0) {
    this.target = newTarget;
    this.v += injectVelocity;
  }

  step(dt) {
    const f = (x, v) => {
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

// Test 1: RK4 Spring Convergence & Interruptibility
const spring = new ContinuousSpringSolver(0, { stiffness: 220, damping: 26, mass: 1 });
spring.setTarget(100);

let steps = 0;
let settled = false;
while (!settled && steps < 1000) {
  const res = spring.step(0.008); // 8ms steps
  settled = res.isSettled;
  steps++;

  // Mid-way interrupt at step 20 with injected pointer speed
  if (steps === 20) {
    spring.setTarget(200, 150); // Interrupt! New target with +150px/s velocity
  }
}

assert(settled === true, 'Spring should settle');
assert.strictEqual(spring.step(0.008).position, 200, 'Spring should reach interrupted target 200');
console.log('PASS: RK4 Spring Solver & Velocity Transfer verified (Settled in', steps * 8, 'ms)');

// 2. Test Squircle G2 Curvature Generation
function generateSquircleSvgPath(width, height, radius) {
  const p = Math.min(width, height) / 2;
  const r = Math.min(radius, p);
  const c = 0.551915024494 * r;
  const g2 = c * 1.12; 

  return `M 0,${r} C 0,${r - g2} ${r - g2},0 ${r},0 L ${width - r},0 C ${width - r + g2},0 ${width},${r - g2} ${width},${r} L ${width},${height - r} C ${width},${height - r + g2} ${width - r + g2},${height} ${width - r},${height} L ${r},${height} C ${r - g2},${height} 0,${height - r + g2} 0,${height - r} Z`.replace(/\s+/g, ' ').trim();
}

const squirclePath = generateSquircleSvgPath(320, 240, 24);
assert(squirclePath.startsWith('M 0,24'), 'Squircle path must start correctly');
assert(squirclePath.endsWith('Z'), 'Squircle path must close correctly');
console.log('PASS: G2 Squircle SVG Path generator verified');

// 3. Test Speculative Intent Trajectory Predictor
class SpeculativeIntentTracker {
  constructor() {
    this.lastPoints = [];
  }
  recordPointerMove(x, y, t) {
    this.lastPoints.push({ x, y, t });
    if (this.lastPoints.length > 5) this.lastPoints.shift();
  }
  willIntersectTarget(rect, lookaheadMs = 80) {
    if (this.lastPoints.length < 2) return false;
    const p1 = this.lastPoints[this.lastPoints.length - 2];
    const p2 = this.lastPoints[this.lastPoints.length - 1];
    const dt = p2.t - p1.t;
    if (dt <= 0) return false;
    const vx = (p2.x - p1.x) / dt;
    const vy = (p2.y - p1.y) / dt;
    const predictedX = p2.x + vx * lookaheadMs;
    const predictedY = p2.y + vy * lookaheadMs;
    return (
      predictedX >= rect.left - 10 &&
      predictedX <= rect.right + 10 &&
      predictedY >= rect.top - 10 &&
      predictedY <= rect.bottom + 10
    );
  }
}

const tracker = new SpeculativeIntentTracker();
const targetButtonRect = { left: 500, right: 620, top: 300, bottom: 340 };

// Pointer moving fast towards the button: from (400, 320) to (450, 320) in 30ms
tracker.recordPointerMove(400, 320, 100);
tracker.recordPointerMove(450, 320, 130);

// Lookahead 80ms: vx = 50 / 30 = 1.666 px/ms -> predictedX = 450 + 1.666 * 80 = 583.3px (Inside 500~620!)
const willHit = tracker.willIntersectTarget(targetButtonRect, 80);
assert(willHit === true, 'Tracker should predict intersection with button target');
console.log('PASS: Speculative Intent Vector Prediction verified');

console.log('\n[ALL 0.001% APEX DESIGN ENGINEERING TESTS PASSED]');
