# 亚像素着色器微光学与几何环境阴影阶梯 (Subpixel Shader Optics & Physical Shadows)

## 1. 物理环境光衰减与 4 阶谐波阴影 (Harmonic Falloff Shadow Matrix)
放弃单一粗暴的 `box-shadow: 0 4px 12px rgba(0,0,0,0.15)`。真实环境光漫反射遵从距离平方反比衰减 $I \propto \frac{1}{r^2}$。
工业级 4 阶层叠环境光矩阵：
1. **接触阴影 (Contact Shadow, 亚像素级)**: $0\text{px } 1\text{px } 1\text{px } \text{rgba}(0,0,0,0.06)$ —— 锁定几何贴合线。
2. **近场漫反射 (Near-Field Penumbra)**: $0\text{px } 2\text{px } 4\text{px } -1\text{px } \text{rgba}(0,0,0,0.08)$ —— 表达高保真厚度。
3. **远场柔化 (Far-Field Ambient)**: $0\text{px } 8\text{px } 24\text{px } -4\text{px } \text{rgba}(0,0,0,0.12)$ —— 悬浮层次感。
4. **边缘掠射微光 (Grazing Rim Highlight)**: 内阴影 $inset\, 0\text{px } 1\text{px } 0\text{px } 0\text{px } \text{oklch}(1\, 0\, 0 / 0.12)$ —— 模仿物理倒角边缘的高光反射。

## 2. GLSL 亚像素微噪点与漫反射材质 (Token-to-Uniform Pipeline)
在 OKLCH 色域上叠加均匀微白噪点，打破数字色带梯变 (Banding Artifacts)，在 8-bit 显示屏上模拟出 10-bit 原生面板的丝滑质感：
```glsl
precision highp float;
uniform vec2 u_resolution;
uniform vec3 u_base_color; // DTCG Semantic Token 映射入参 (OKLCH 转 RGB)
uniform float u_time;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    vec2 st = gl_FragCoord.xy / u_resolution.xy;
    // 微尺度高频极低振幅白噪点 (振幅仅 0.015, 彻底消除色彩带状断层)
    float noise = (random(st * 1.5 + fract(u_time * 0.01)) - 0.5) * 0.018;
    vec3 color = clamp(u_base_color + vec3(noise), 0.0, 1.0);
    gl_FragColor = vec4(color, 1.0);
}
```
