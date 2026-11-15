/**
 * One large, faint, grainy glow in the footer's bottom-right corner, drawn once (never animated)
 * on a canvas covering the footer.
 *
 * It's one soft mass shaped to its corner: its falloff follows a superellipse centred on the
 * corner (squarer than a circle, so it hugs the two edges it meets), and low-frequency noise
 * wobbles that edge so it reads as a blob rather than a geometric curve. Per-pixel grain on top.
 *
 * A small custom shader (Paper's ShaderMount owns the canvas) rather than Paper's Grain Gradient,
 * whose "blob" is four merging discs with a hard rim: it can't read as one mass fitted to a corner.
 */
import { getShaderColorFromString, ShaderMount } from "@paper-design/shaders";
import { cssPixelCount, renderAtCssResolution } from "./shader-scale";

type Glow = {
	/** how far it reaches along the footer's width and height, as fractions of them */
	reach: [number, number];
	/** superellipse exponent: 2 is a circle, higher hugs the corner more squarely */
	squareness: number;
	/** how much the noise moves its edge, as a fraction of its reach */
	wobble: number;
	/** opacity at the corner itself */
	strength: number;
	/** which patch of the noise shapes its edge */
	seed: number;
};

const GLOW: Glow = {
	reach: [0.7, 1.1],
	squareness: 2.3,
	wobble: 0.22,
	strength: 0.128,
	seed: 17.4,
};
/** grain strength, 0..1: how far each pixel strays from the smooth glow */
const GRAIN = 0.6;
const COLOR = "#ffe292";

const fragmentShader = /* glsl */ `#version 300 es
precision mediump float;
uniform vec2 u_resolution;
uniform float u_pixelRatio;
// reach x, reach y, squareness, wobble
uniform highp vec4 u_shape;
// strength, seed
uniform highp vec4 u_look;
uniform float u_grain;
uniform vec4 u_color;
out vec4 fragColor;

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
  for (int i = 0; i < 3; i++) {
    sum += amp * noise(p);
    p = p * 2.0 + 11.7;
    amp *= 0.5;
  }
  return sum / 0.875;
}

// p: CSS px from the glow's corner, measured into the footer along both edges
float glow(highp vec2 p, highp vec2 size, highp vec4 shape, highp vec4 look) {
  highp vec2 q = p / (shape.xy * size);
  highp float d = pow(pow(q.x, shape.z) + pow(q.y, shape.z), 1.0 / shape.z);
  d += (fbm(p / 260.0 + look.y) - 0.5) * shape.w;
  float g = 1.0 - smoothstep(0.0, 1.0, d);
  return look.x * g * g;
}

void main() {
  highp vec2 size = u_resolution / u_pixelRatio;
  highp vec2 frag = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y) / u_pixelRatio;
  // measured from the bottom-right corner
  float a = glow(size - frag, size, u_shape, u_look);
  // grain: each pixel a random amount brighter or dimmer, the average unchanged
  a *= 1.0 - u_grain + 2.0 * u_grain * hash(floor(frag));
  a = clamp(a, 0.0, 1.0) * u_color.a;
  fragColor = vec4(u_color.rgb * a, a);
}
`;

const shape = ({ reach, squareness, wobble }: Glow) => [...reach, squareness, wobble];
const look = ({ strength, seed }: Glow) => [strength, seed, 0, 0];

/** `host` covers the footer, behind its content. Returns cleanup. */
export function attachFooterGlow(host: HTMLElement) {
	let mount: ShaderMount;
	try {
		mount = new ShaderMount(
			host,
			fragmentShader,
			{
				u_shape: shape(GLOW),
				u_look: look(GLOW),
				u_grain: GRAIN,
				u_color: getShaderColorFromString(COLOR),
			},
			{ premultipliedAlpha: true },
			// still: drawn on creation and whenever the footer resizes, never animated
			0,
			0,
			1,
			// 1x: the grain is one CSS px, kept sharp (renderAtCssResolution scales up unsmoothed)
			cssPixelCount(host),
		);
	} catch {
		// no WebGL: no glow
		return () => {};
	}
	const stopScaling = renderAtCssResolution(mount, host);
	return () => {
		stopScaling();
		mount.dispose();
	};
}
