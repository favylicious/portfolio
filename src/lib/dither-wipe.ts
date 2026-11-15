/**
 * A dithered fill that wipes across an element: the accordion headings' hover fill, and the footer
 * links' fill when the plug goes in (footer-wipe.ts). Drawn with Magic UI Dither Field's dithering (as the projects
 * glow is, see dither-glow.ts): 2px dots, its 8×8 Bayer threshold, its fbm noise roughening the
 * edge, and sparse dots drawn fainter than dense ones. Paper Shaders' ShaderMount owns the canvas.
 * Source: https://magicui.design/r/dither-field.json (MIT license: see magicui-LICENSE.md).
 *
 * A fill is the stretch between two edges, each a dithered ramp `band` px wide: the front sweeps
 * in from the left when the fill is switched on, and the tail follows it out to the right when
 * it's switched off, so everything only ever travels left to right. Switching on again while a
 * fill is still on its way out starts a second fill from the left behind it (the shader draws
 * two), rather than pulling the old one back. Edges are positions along s, tweened here and handed
 * to the shader; it renders only on those frames (the noise doesn't move). Two shapes:
 * - diagonal: s = x + y, a 45° edge (the accordion)
 * - radial: s = distance from the middle of the left edge, a ring spreading rightwards (the footer)
 *
 * The canvas is created the first time a fill is switched on.
 */
import { getShaderColorFromString, ShaderMount } from "@paper-design/shaders";
import { cssPixelCount, DITHER_DOT_PX, renderAtCssResolution } from "./shader-scale";

/** how far the noise can shift an edge, as a fraction of the band (the travel is padded by half of it) */
const NOISE = 0.6;
/** ease-out expo, cubic-bezier(0.16, 1, 0.3, 1) near enough: fast across, long slow settle */
const ease = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

const fragmentShader = /* glsl */ `#version 300 es
precision mediump float;
uniform vec2 u_resolution;
uniform float u_pixelRatio;
// the current fill, and the previous one while it's still leaving
uniform highp float u_front;
uniform highp float u_tail;
uniform highp float u_oldFront;
uniform highp float u_oldTail;
uniform highp float u_band;
uniform highp float u_noise;
// .xy = the radial shape's origin (CSS px), .z = 1 for radial, 0 for diagonal
uniform highp vec3 u_radial;
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
  highp mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = turn * p * 2.0 + 11.7;
    amp *= 0.5;
  }
  return sum;
}

float threshold(highp vec2 cell) {
  highp vec2 c = floor(cell);
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
  // one canvas pixel per dot (see shader-scale.ts); a dot is two CSS pixels, as upstream
  highp vec2 cell = floor(vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y));
  highp vec2 p = (cell + 0.5) * 2.0;
  highp float s = u_radial.z > 0.5 ? length(p - u_radial.xy) : p.x + p.y;
  // fbm sums to just under 1, centred near 0.5
  highp float n = (fbm(p / 170.0) - 0.5) * u_noise;
  highp float current = min((u_front - s) / u_band, (s - u_tail) / u_band) + n;
  highp float old = min((u_oldFront - s) / u_band, (s - u_oldTail) / u_band) + n;
  float v = clamp(max(current, old), 0.0, 1.0);
  float on = step(threshold(cell), v);
  float alpha = u_color.a * mix(0.35, 1.0, v) * on;
  fragColor = vec4(u_color.rgb * alpha, alpha);
}
`;

type Tween = { from: number; to: number; start: number; value: number };

type WipeOptions = {
	shape?: "diagonal" | "radial";
	/** width of each edge's dithered ramp, CSS px */
	band?: number;
	/** time for an edge to cross, ms */
	duration?: number;
	color?: string;
	/** called once the canvas exists (it's created the first time the fill is switched on) */
	onMount?: () => void;
};

export type DitherWipe = {
	/** Switches the fill on or off; false is returned if it can't draw (no WebGL). */
	setActive: (active: boolean) => boolean;
	dispose: () => void;
};

/** `host` is an element covering the area to fill, behind its content. */
export function createDitherWipe(
	host: HTMLElement,
	{
		shape = "diagonal",
		band = 288,
		duration = 1500,
		color = "#ffe292",
		onMount,
	}: WipeOptions = {},
): DitherWipe {
	const radial = shape === "radial";
	const origin = () => [0, host.offsetHeight / 2, radial ? 1 : 0];

	// created on first use, so elements nobody touches never get a WebGL context
	let mount: ShaderMount | undefined;
	let stopScaling: (() => void) | undefined;
	let failed = false;
	const ensureMount = () => {
		if (mount || failed) return mount;
		try {
			const [r, g, b] = getShaderColorFromString(color);
			mount = new ShaderMount(
				host,
				fragmentShader,
				{
					u_front: 0,
					u_tail: 0,
					u_oldFront: 0,
					u_oldTail: 0,
					u_band: band,
					u_noise: NOISE,
					u_radial: origin(),
					u_color: [r, g, b, 1],
				},
				{ premultipliedAlpha: true },
				0,
				0,
				1,
				// one canvas pixel per dot: every pixel within a dot would compute the same thing
				cssPixelCount(host, DITHER_DOT_PX),
			);
			stopScaling = renderAtCssResolution(mount, host, DITHER_DOT_PX);
			onMount?.();
		} catch {
			failed = true;
		}
		return mount;
	};

	const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
	const pad = band * (NOISE / 2);
	// positions along s at which an edge has fully left the host on either side
	const before = -pad;
	const after = () =>
		(radial
			? Math.hypot(host.offsetWidth, host.offsetHeight / 2)
			: host.offsetWidth + host.offsetHeight) +
		band +
		pad;

	const tween = (): Tween => ({ from: before, to: before, start: 0, value: before });
	const front = tween();
	const tail = tween();
	// the previous fill, still leaving when the fill was switched on again
	const oldFront = tween();
	const oldTail = tween();
	let active = false;
	let frame = 0;

	const retarget = (tween: Tween, to: number, now: number) => {
		tween.from = tween.value;
		tween.to = to;
		tween.start = now;
	};
	const step = (tween: Tween, now: number) => {
		const t = reducedMotion.matches ? 1 : (now - tween.start) / duration;
		tween.value = tween.from + (tween.to - tween.from) * ease(Math.min(t, 1));
		return t >= 1;
	};
	const tick = (now: number) => {
		frame = 0;
		if (!mount) return;
		// step every edge (no short-circuiting)
		const done = [front, tail, oldFront, oldTail].map((edge) => step(edge, now));
		mount.setUniforms({
			u_front: front.value,
			u_tail: tail.value - band,
			u_oldFront: oldFront.value,
			u_oldTail: oldTail.value - band,
		});
		if (done.includes(false)) frame = requestAnimationFrame(tick);
	};
	const run = () => {
		if (!frame) frame = requestAnimationFrame(tick);
	};

	const setActive = (next: boolean) => {
		if (next === active) return !failed;
		if (next && !ensureMount()) return false;
		active = next;
		const now = performance.now();
		if (active) {
			// what's left of the last fill keeps leaving to the right as the "old" one (replacing
			// any older remnant), and a fresh fill starts from the left behind it
			Object.assign(oldFront, front);
			Object.assign(oldTail, tail);
			front.value = before;
			tail.value = before;
			retarget(front, after(), now);
			retarget(tail, before, now);
		} else {
			// the front carries on to the far side while the tail chases it out
			retarget(tail, after(), now);
		}
		run();
		return true;
	};

	// the host can change size (the accordion's panels open and close, and it narrows as its
	// carousel slides in): the far side moves with it, so every edge headed there (or already
	// there) is re-aimed at the new one, keeping its timing. Otherwise a fill that's leaving stops
	// where the far side used to be and its dither is left showing beyond that; a full fill stays
	// full the same way. The radial origin is kept on the middle of the left edge.
	const resize = new ResizeObserver(() => {
		if (!mount) return;
		mount.setUniforms({ u_radial: origin() });
		const far = after();
		for (const edge of [front, tail, oldFront, oldTail])
			if (edge.to !== before) edge.to = far;
		run();
	});
	resize.observe(host);

	return {
		setActive,
		dispose: () => {
			resize.disconnect();
			cancelAnimationFrame(frame);
			stopScaling?.();
			mount?.dispose();
		},
	};
}

/**
 * The accordion's use: the fill follows the trigger's hover/keyboard focus. Until its canvas
 * exists (and with no JS or no WebGL) the CSS `dither-wipe` utility in tailwind.css is in place;
 * creating the canvas sets data-shader-wipe on the trigger, which switches that one off. That
 * happens in the hover handler, before the hover styles are painted, so the CSS wipe never shows.
 * Returns cleanup.
 */
export function attachDitherWipe(trigger: HTMLElement, host: HTMLElement) {
	const wipe = createDitherWipe(host, {
		onMount: () => {
			trigger.dataset.shaderWipe = "";
		},
	});
	const controller = new AbortController();
	const sync = () => wipe.setActive(trigger.matches(":hover, :focus-visible"));
	for (const type of ["pointerenter", "pointerleave", "focus", "blur"] as const)
		trigger.addEventListener(type, sync, { signal: controller.signal });
	sync();

	return () => {
		controller.abort();
		delete trigger.dataset.shaderWipe;
		wipe.dispose();
	};
}
