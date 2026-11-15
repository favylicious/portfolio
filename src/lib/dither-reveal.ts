/**
 * Dithered reveal: the cards of a grid appear dot by dot, one card after another, the first time
 * they scroll into view. Cards arriving in view together are staggered in DOM order (so the grid
 * reveals row by row, left to right).
 *
 * Drawn with Magic UI Dither Field's dithering, like the cursor glow and the accordion wipe
 * (dither-glow.ts, dither-wipe.ts): 2px dots, its 8×8 Bayer threshold, and its fbm noise, here
 * deciding which patches of a card fill in first. Paper Shaders' ShaderMount owns the canvas.
 * Source: https://magicui.design/r/dither-field.json (MIT license: see magicui-LICENSE.md).
 *
 * A shader can't mask DOM content, so it works as a cover instead: one canvas over the whole grid
 * paints each unrevealed card's area in the cells' background colour, and the reveal dissolves
 * that cover. It renders only while a card is animating, and the canvas is removed once every card
 * is revealed.
 *
 * Nothing is hidden without JS or WebGL, or with reduced motion. Until the cover has drawn, cards
 * are hidden by data-dither-pending (style it with opacity: 0).
 */
import { ShaderMount } from "@paper-design/shaders";
import { cssPixelCount, DITHER_DOT_PX, renderAtCssResolution } from "./shader-scale";

/** most cards one grid can reveal (a fixed-size uniform array); any beyond it just show */
const MAX_CARDS = 16;
/** how much the noise staggers the fill within a card, as a fraction of the reveal */
const NOISE = 0.6;

const fragmentShader = /* glsl */ `#version 300 es
precision mediump float;
uniform vec2 u_resolution;
uniform float u_pixelRatio;
// per card: x, y, width, height (CSS px from the canvas's top-left)
uniform highp vec4 u_rects[${MAX_CARDS}];
// per card: .x = reveal progress 0..1 (1 = fully shown), .y = noise offset
uniform highp vec4 u_state[${MAX_CARDS}];
uniform highp float u_noise;
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

  float covered = 0.0;
  for (int i = 0; i < ${MAX_CARDS}; i++) {
    highp vec4 r = u_rects[i];
    if (r.z <= 0.0) continue;
    if (p.x < r.x || p.y < r.y || p.x >= r.x + r.z || p.y >= r.y + r.w) continue;
    highp vec4 st = u_state[i];
    // fbm sums to just under 1: at progress 0 nothing shows, at 1 everything does
    highp float n = fbm(p / 170.0 + st.y);
    highp float v = st.x * (1.0 + u_noise) - u_noise * n;
    covered = 1.0 - step(threshold(cell), v);
  }
  fragColor = vec4(u_color.rgb, 1.0) * covered;
}
`;

/** Any CSS colour as 0..1 sRGB, via a 2D canvas (computed colours aren't always rgb()). */
const toRgb = (color: string): [number, number, number] => {
	const context = document.createElement("canvas").getContext("2d");
	if (!context) return [0, 0, 0];
	context.fillStyle = color;
	context.fillRect(0, 0, 1, 1);
	const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
	return [r / 255, g / 255, b / 255];
};

type Options = {
	/** time for one card to fill in, ms */
	duration?: number;
	/** delay between consecutive cards, ms */
	stagger?: number;
};

/**
 * `grid` is the positioned element the cards sit in (the cover is appended to it); a card's parent
 * supplies the background colour the cover is painted in. Returns cleanup for Astro's page swaps.
 */
export function attachDitherReveal(
	grid: HTMLElement,
	cards: HTMLElement[],
	{ duration = 900, stagger = 90 }: Options = {},
) {
	if (!cards.length || matchMedia("(prefers-reduced-motion: reduce)").matches)
		return () => {};
	const items = cards.slice(0, MAX_CARDS);

	// same element type as the grid's children, so a list stays a valid list
	const host = document.createElement(
		grid.firstElementChild?.tagName.toLowerCase() ?? "div",
	);
	host.setAttribute("aria-hidden", "true");
	host.setAttribute("role", "presentation");
	// above the cards' content (z-index 2 in the projects grid)
	host.style.cssText =
		"position:absolute;inset:0;z-index:3;pointer-events:none;list-style:none";
	grid.append(host);

	// per card: when its reveal starts (undefined = not yet in view) and whether it has finished
	const starts: (number | undefined)[] = items.map(() => undefined);
	const done = items.map(() => false);
	const pad = (rows: number[][]) => [
		...rows,
		...Array.from({ length: MAX_CARDS - rows.length }, () => [0, 0, 0, 0]),
	];
	// the cards' boxes within the cover: measured up front and when the grid reflows, not per frame
	let boxes: number[][] = [];
	const measure = () => {
		const origin = host.getBoundingClientRect();
		boxes = items.map((item) => {
			const rect = item.getBoundingClientRect();
			return [rect.left - origin.left, rect.top - origin.top, rect.width, rect.height];
		});
	};
	measure();
	const rects = () => pad(boxes.map((box, i) => (done[i] ? [0, 0, 0, 0] : box)));
	const state = (now: number) =>
		pad(
			items.map((_, i) => {
				const start = starts[i];
				const progress =
					start === undefined ? 0 : Math.max(0, Math.min(1, (now - start) / duration));
				// a different patch of the noise for each card, so no two fill in alike
				return [progress, i * 53.1, 0, 0];
			}),
		);

	let mount: ShaderMount;
	try {
		const background = getComputedStyle(items[0].parentElement ?? grid).backgroundColor;
		mount = new ShaderMount(
			host,
			fragmentShader,
			{
				u_rects: rects(),
				u_state: state(0),
				u_noise: NOISE,
				u_color: [...toRgb(background), 1],
			},
			{ premultipliedAlpha: true },
			0,
			0,
			1,
			// one canvas pixel per dot: every pixel within a dot would compute the same thing
			cssPixelCount(host, DITHER_DOT_PX),
		);
	} catch {
		// no WebGL: the cards simply show
		host.remove();
		return () => {};
	}

	const stopScaling = renderAtCssResolution(mount, host, DITHER_DOT_PX);
	let disposed = false;
	let frame = 0;
	let unhide = 0;
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		observer.disconnect();
		resize.disconnect();
		cancelAnimationFrame(frame);
		cancelAnimationFrame(unhide);
		for (const item of items) delete item.dataset.ditherPending;
		stopScaling();
		mount.dispose();
		host.remove();
	};

	const tick = (now: number) => {
		frame = 0;
		items.forEach((_, i) => {
			const start = starts[i];
			if (start !== undefined && now - start >= duration) done[i] = true;
		});
		if (done.every(Boolean)) {
			dispose();
			return;
		}
		mount.setUniforms({ u_rects: rects(), u_state: state(now) });
		// keep going while any card that has started is still filling in (or waiting its turn)
		if (starts.some((start, i) => start !== undefined && !done[i]))
			frame = requestAnimationFrame(tick);
	};
	const run = () => {
		if (!frame) frame = requestAnimationFrame(tick);
	};

	// hide the cards until the cover has had a couple of frames to draw over them
	for (const item of items) item.dataset.ditherPending = "";
	unhide = requestAnimationFrame(() => {
		unhide = requestAnimationFrame(() => {
			for (const item of items) delete item.dataset.ditherPending;
		});
	});

	const observer = new IntersectionObserver(
		(entries) => {
			const entering = entries
				.filter((entry) => entry.isIntersecting)
				.map((entry) => entry.target as HTMLElement)
				.sort((a, b) => items.indexOf(a) - items.indexOf(b));
			const now = performance.now();
			entering.forEach((item, i) => {
				observer.unobserve(item);
				starts[items.indexOf(item)] = now + i * stagger;
			});
			if (entering.length) run();
		},
		{ threshold: 0.2 },
	);
	for (const item of items) observer.observe(item);
	// the cards move within the grid when it reflows: keep the cover on them
	const resize = new ResizeObserver(() => {
		if (disposed) return;
		measure();
		mount.setUniforms({ u_rects: rects() });
	});
	resize.observe(grid);

	return dispose;
}
