/**
 * The projects grid's cursor glow: Magic UI Dither Field's glow pattern (a soft orb of slowly
 * wandering, fbm-textured light) and its 8×8 Bayer threshold, centred on the cursor and scaled by
 * the site's radius and strength. Paper Shaders' ShaderMount owns the WebGL canvas, its sizing to
 * the host element and the device pixel ratio; it animates only while the glow is visible (and
 * not at all with reduced motion), otherwise rendering only when a uniform changes.
 * The canvas has one pixel per 2px dot (shader-scale.ts).
 * Source: https://magicui.design/r/dither-field.json (MIT license: see magicui-LICENSE.md).
 */
import { getShaderColorFromString, ShaderMount } from "@paper-design/shaders";
import { cssPixelCount, DITHER_DOT_PX, renderAtCssResolution } from "./shader-scale";

const fragmentShader = /* glsl */ `#version 300 es
precision mediump float;
uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_time;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_strength;
uniform vec4 u_color;
out vec4 fragColor;

// High precision inside the noise functions keeps the upstream hash stable, while the uniforms
// retain the precision required by Paper's vertex shader.
highp float hash(highp vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
highp float noise(highp vec2 p) {
  highp vec2 i = floor(p);
  highp vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  highp float a = hash(i);
  highp float b = hash(i + vec2(1.0, 0.0));
  highp float c = hash(i + vec2(0.0, 1.0));
  highp float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
highp float fbm(highp vec2 p) {
  highp float sum = 0.0;
  highp float amp = 0.5;
  highp mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = turn * p * 2.0 + 11.7;
    amp *= 0.5;
  }
  return sum;
}

// Magic UI's glow pattern: a soft orb with slowly wandering, textured light.
float pattern(vec2 p, vec2 size, float t) {
  vec2 c = 0.5 * size + vec2(sin(t * 0.21), cos(t * 0.17)) * 0.05 * size;
  float r = 0.5 * min(size.x, size.y);
  float d = length(p - c) / r;
  float n = fbm(p / 170.0 + vec2(t * 0.05, -t * 0.04));
  return exp(-1.7 * d * d) * (0.75 + 0.45 * n) + 0.12 * n * exp(-d);
}

float threshold(vec2 cell) {
  vec2 c = floor(cell);
  float sum = 0.0;
  float weight = 16.0;
  for (int i = 0; i < 3; i++) {
    vec2 b = mod(c, 2.0);
    sum += weight * mod(2.0 * b.x + 3.0 * b.y, 4.0);
    c = floor(c * 0.5);
    weight *= 0.25;
  }
  return (sum + 0.5) / 64.0;
}

void main() {
  // One canvas pixel per dot (see shader-scale.ts); thresholds remain anchored to the grid as
  // the orb moves.
  vec2 cell = floor(vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y));
  vec2 center = (cell + 0.5) * 2.0;
  float radius = max(u_radius, 0.001);
  // Outside this the orb (which wanders up to 0.1 radius) is always below the lowest threshold:
  // skip the noise there, which is most of the canvas.
  if (u_strength <= 0.0 || length(center - u_center) > 1.9 * radius) {
    fragColor = vec4(0.0);
    return;
  }
  vec2 p = vec2(center.x - u_center.x + radius, radius - (center.y - u_center.y));
  float v = pattern(p, vec2(radius * 2.0), u_time);
  float over = max(v - 0.85, 0.0);
  v = min(v, 0.85) + over / (1.0 + 4.0 * over);
  v = clamp(v * 0.75 * u_strength, 0.0, 1.0);
  v = max(v - 0.02, 0.0) / 0.98;
  float on = step(threshold(cell), v);
  float alpha = u_color.a * mix(0.35, 1.0, v) * on * u_strength;
  fragColor = vec4(u_color.rgb * alpha, alpha);
}
`;

export type DitherGlow = {
	/** centre and radius in CSS px from the host's top-left; strength 0..1 */
	update: (x: number, y: number, radius: number, strength: number) => void;
	dispose: () => void;
};

export function createDitherGlow(
	host: HTMLElement,
	{ color = "#ffe292", alpha = 0.242 } = {},
): DitherGlow {
	const [r, g, b] = getShaderColorFromString(color);
	const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
	const mount = new ShaderMount(
		host,
		fragmentShader,
		{
			u_center: [0, 0],
			u_radius: 0,
			u_strength: 0,
			u_color: [r, g, b, alpha],
		},
		{ premultipliedAlpha: true },
		0,
		0,
		1,
		// one canvas pixel per dot: every pixel within a dot would compute the same thing
		cssPixelCount(host, DITHER_DOT_PX),
	);
	const stopScaling = renderAtCssResolution(mount, host, DITHER_DOT_PX);
	let running = false;
	return {
		update(x, y, radius, strength) {
			mount.setUniforms({
				u_center: [x, y],
				u_radius: radius,
				u_strength: strength,
			});
			const animate = strength > 0 && !reducedMotion.matches;
			if (animate !== running) {
				running = animate;
				mount.setSpeed(animate ? 1 : 0);
			}
		},
		dispose: () => {
			stopScaling();
			mount.dispose();
		},
	};
}
