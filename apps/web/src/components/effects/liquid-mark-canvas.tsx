'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Liquid-metal hexagon emblem.
 * Fragment shader ported from https://github.com/collidingScopes/liquid-logo (MIT, (c) 2025 Alan Ang):
 * the iterated sine "liquid" field, tanh colour ramp, simplex-noise flow and edge highlight are that
 * project's; the logo mask is a procedural hexagon SDF here (resolution independent, no texture), and
 * the palette is tinted toward the current game accent.
 */
const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_tint;
uniform float u_tintAmount;
uniform float u_iterations;

vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// Signed distance to a pointy-top regular hexagon of inradius r.
float sdHex(vec2 p, float r){
  p = p.yx;
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

void main(){
  vec2 q = (vUv - 0.5) * 2.0;
  // Mark: an outlined hexagon around a solid one (matches the SVG wordmark).
  float dRing = abs(sdHex(q, 0.84)) - 0.075;
  float dCore = sdHex(q, 0.44);
  float d = min(dRing, dCore);
  float aa = 2.0 / min(u_res.x, u_res.y);
  float alpha = 1.0 - smoothstep(-aa, aa, d);
  if (alpha < 0.003) discard;
  float edge = 1.0 - smoothstep(0.0, 0.09, abs(d));

  // --- liquid-logo pattern (Glow-like preset) ---
  vec2 r = u_res;
  vec2 FC = vUv * r;
  vec2 p = (FC * 2.0 - r) / r.y;
  float dotP = dot(p, p);
  float lx = abs(0.66 - dotP) * 0.36;
  vec2 v = p * (1.0 - lx) / 3.11;
  float flow = snoise(vec3(p * 2.0, u_time * 0.15)) * 0.5;
  v += vec2(flow, flow * 0.7);
  v += vec2(sin(edge * 10.0), cos(edge * 8.0)) * edge * 2.2;
  vec4 o = vec4(0.0);
  for (float i = 0.0; i < 16.0; i++) {
    if (i >= u_iterations) break;
    float idx = i + 1.0;
    vec2 off = cos(v.yx * idx + vec2(0.0, idx) + u_time) / idx + 6.0;
    off *= 1.0 + edge * 0.7;
    v += off;
    o += (sin(vec4(v.x, v.y, v.y, v.x)) + 1.0) * abs(v.x - v.y) * 0.1;
  }
  o = o.wxyz * 0.5 + o * 0.5;
  vec4 expPy = exp(p.y * vec4(0.2, 0.0, -0.2, 0.0));
  float expLx = exp(-1.8 * lx);
  vec4 ratio = expPy * expLx / o;
  vec4 e2 = exp(2.0 * ratio);
  o = (e2 - 1.0) / (e2 + 1.0);
  o = clamp(o, 0.0, 1.0);

  // Tint the metal toward the game accent, keep the liquid luminance structure.
  float luma = dot(o.rgb, vec3(0.299, 0.587, 0.114));
  vec3 chrome = vec3(luma);
  vec3 col = mix(o.rgb, chrome * u_tint * 1.5 + chrome * 0.22, u_tintAmount);
  col += pow(edge, 3.0) * vec3(0.55, 0.62, 0.72);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), alpha);
}`;

function Quad({ tint, tintAmount, animate, iterations, seed }: { tint: string; tintAmount: number; animate: boolean; iterations: number; seed: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  // Initial values only; all later changes go through the material ref (never mutate memoised objects).
  const initial = useMemo(
    () => ({
      u_res: { value: new THREE.Vector2(256, 256) },
      u_time: { value: seed },
      u_tint: { value: new THREE.Color(tint) },
      u_tintAmount: { value: tintAmount },
      u_iterations: { value: iterations },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    const m = mat.current;
    if (!m) return;
    (m.uniforms.u_tint!.value as THREE.Color).set(tint);
    m.uniforms.u_tintAmount!.value = tintAmount;
  }, [tint, tintAmount]);
  useFrame((state, delta) => {
    const m = mat.current;
    if (!m) return;
    if (animate) m.uniforms.u_time!.value += delta * 0.55;
    const { width, height } = state.size;
    (m.uniforms.u_res!.value as THREE.Vector2).set(width * state.viewport.dpr, height * state.viewport.dpr);
  });
  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={mat} vertexShader={vertex} fragmentShader={fragment} uniforms={initial} transparent depthTest={false} />
    </mesh>
  );
}

export default function LiquidMarkCanvas({
  tint,
  animate,
  tintAmount = 0.62,
  iterations = 10,
  seed = 3.2,
}: {
  tint: string;
  animate: boolean;
  tintAmount?: number;
  iterations?: number;
  seed?: number;
}) {
  return (
    <Canvas
      // Static (paused) marks render on demand: one frame, zero ongoing GPU cost.
      frameloop={animate ? 'always' : 'demand'}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      camera={{ position: [0, 0, 1] }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Quad tint={tint} tintAmount={tintAmount} animate={animate} iterations={iterations} seed={seed} />
    </Canvas>
  );
}
