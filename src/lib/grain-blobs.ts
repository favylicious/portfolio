/**
 * Large, faint, grainy blobs scattered down the page: Paper Shaders' Grain Gradient ("blob" shape:
 * four soft discs that wander and merge, so each is roundish but keeps changing outline), in
 * the flat primary colour.
 *
 * `field` is an absolutely positioned layer behind the page; it's stretched here to the page's
 * height and filled with the blobs. Their placement is random on every load: one per stretch of
 * the page (so they spread out rather than clump), anywhere across its width, each with its own
 * size, turn, speed and point in the animation. A radial CSS mask (.grain-blob) fades each one
 * out well before its square's edge.
 *
 * The whole field is hidden while the page is at the very top and fades in once the visitor has
 * scrolled.
 *
 * They drift continuously, so they're kept cheap: rendered at 1x, redrawn FPS times a second
 * (not on every frame) and only while on screen with the field showing, and still under reduced
 * motion.
 */
import {
	getShaderColorFromString,
	getShaderNoiseTexture,
	GrainGradientShapes,
	grainGradientFragmentShader,
	ShaderFitOptions,
	ShaderMount,
} from "@paper-design/shaders";
import { cssPixelCount, imageLoaded, renderAtCssResolution } from "./shader-scale";

/** the flat primary alone: no shades of it, so a blob varies only in strength */
const COLORS = ["#ffe292"];
/** Paper's own speed unit; each blob runs at 0.7x to 1.3x of it */
const SPEED = 0.36;
/** grain strength, 0..1 */
const GRAIN = 0.1;
/** a blob's square, in viewport heights (about the inner 60% of it is visible through the mask) */
const SIZE = [110, 160];
/** one blob per this many viewport heights of page, within these counts */
const SPACING = 0.9;
const COUNT = [3, 6];
/** the field's fade in (and out) as the visitor leaves (or returns to) the top of the page, ms */
const FADE = 1200;
/** how often a blob is redrawn while it's on screen, per second (the drift is slow) */
const FPS = 20;

const between = (min: number, max: number) => min + Math.random() * (max - min);

/** Returns cleanup for Astro's page swaps. */
export function attachGrainBlobs(field: HTMLElement) {
	let disposed = false;
	const cleanups: (() => void)[] = [];
	const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
	const noise = getShaderNoiseTexture();

	type Blob = {
		mount: ShaderMount;
		/** Paper's speed unit */
		speed: number;
		/** position in the animation, ms scaled by speed (Paper's "frame") */
		frame: number;
		/** on screen, per the IntersectionObserver */
		visible: boolean;
	};
	const blobs = new Map<Element, Blob>();
	/** the field is showing or still fading out; false once it's fully hidden at the top of the page */
	let fieldShown = false;

	// One ticker for every blob. Paper would redraw an animating mount on every frame; the drift
	// is slow enough that FPS redraws a second look the same, so the mounts stay at speed 0 and are
	// stepped here instead. It runs only while some blob is on screen with the field showing.
	const shouldRun = (blob: Blob) => blob.visible && fieldShown && !reducedMotion.matches;
	let ticker = 0;
	let last = 0;
	const tick = (now: number) => {
		ticker = 0;
		const running = [...blobs.values()].filter(shouldRun);
		if (!running.length) return;
		const elapsed = now - last;
		if (elapsed >= 1000 / FPS) {
			last = now;
			// capped, so a long pause (a background tab) doesn't make the blobs jump
			const step = Math.min(elapsed, 250);
			for (const blob of running) {
				blob.frame += step * blob.speed;
				blob.mount.setFrame(blob.frame);
			}
		}
		ticker = requestAnimationFrame(tick);
	};
	const wake = () => {
		if (ticker || ![...blobs.values()].some(shouldRun)) return;
		last = performance.now();
		ticker = requestAnimationFrame(tick);
	};
	cleanups.push(() => cancelAnimationFrame(ticker));

	// the field isn't in the page's flow: keep it as tall as the page
	const fit = () => {
		field.style.height = `${document.body.offsetHeight}px`;
	};
	fit();
	const resize = new ResizeObserver(fit);
	resize.observe(document.body);
	cleanups.push(() => resize.disconnect());

	// hidden while the page is at the very top (the hero starts clean), faded in once the visitor
	// has scrolled, and out again if they return to the top. The blobs are stepped only while the
	// field can be seen: from the moment it starts to show until its fade-out has finished.
	field.style.transition = `opacity ${FADE}ms ease-out`;
	let scrolled: boolean | undefined;
	let hideTimer = 0;
	const reveal = () => {
		const next = scrollY > 4;
		if (next === scrolled) return;
		scrolled = next;
		field.style.opacity = next ? "1" : "0";
		clearTimeout(hideTimer);
		if (next) {
			fieldShown = true;
			wake();
		} else {
			hideTimer = window.setTimeout(() => {
				fieldShown = false;
			}, FADE);
		}
	};
	reveal();
	addEventListener("scroll", reveal, { passive: true });
	cleanups.push(() => {
		removeEventListener("scroll", reveal);
		clearTimeout(hideTimer);
	});

	const build = () => {
		const pages = document.body.offsetHeight / window.innerHeight;
		const count = Math.max(COUNT[0], Math.min(COUNT[1], Math.round(pages / SPACING)));
		const observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				const blob = blobs.get(entry.target);
				if (blob) blob.visible = entry.isIntersecting;
			}
			wake();
		});
		const onMotionChange = () => wake();
		reducedMotion.addEventListener("change", onMotionChange);
		cleanups.push(() => {
			observer.disconnect();
			reducedMotion.removeEventListener("change", onMotionChange);
		});

		for (let i = 0; i < count; i++) {
			const host = document.createElement("div");
			host.className = "grain-blob";
			const size = between(SIZE[0], SIZE[1]);
			// centred somewhere in its own stretch of the page, anywhere across the width
			host.style.cssText = `position:absolute;width:${size}vh;height:${size}vh;left:${between(0, 100)}%;top:${((i + Math.random()) / count) * 100}%;translate:-50% -50%`;
			field.append(host);

			const speed = SPEED * between(0.7, 1.3);
			const frame = between(0, 200_000);
			let mount: ShaderMount;
			try {
				mount = new ShaderMount(
					host,
					grainGradientFragmentShader,
					{
						u_colorBack: [0, 0, 0, 0],
						u_colors: COLORS.map(getShaderColorFromString),
						u_colorsCount: COLORS.length,
						u_softness: 1,
						u_intensity: 0.35,
						u_noise: GRAIN,
						u_shape: GrainGradientShapes.blob,
						u_noiseTexture: noise,
						u_fit: ShaderFitOptions.contain,
						u_scale: 1,
						u_rotation: between(0, 360),
						u_offsetX: 0,
						u_offsetY: 0,
						u_originX: 0.5,
						u_originY: 0.5,
						u_worldWidth: 0,
						u_worldHeight: 0,
					},
					{ premultipliedAlpha: true },
					// never animates itself: stepped by the ticker below (see tick)
					0,
					frame,
					1,
					cssPixelCount(host),
				);
			} catch {
				// no WebGL: no blobs
				host.remove();
				break;
			}
			const stopScaling = renderAtCssResolution(mount, host);
			blobs.set(host, { mount, speed, frame, visible: false });
			observer.observe(host);
			cleanups.push(() => {
				stopScaling();
				blobs.delete(host);
				mount.dispose();
				host.remove();
			});
		}
	};

	const start = async () => {
		if (!noise) return;
		try {
			await imageLoaded(noise);
		} catch {
			return;
		}
		if (disposed) return;
		// the field is hidden on small screens (no blobs there): build once it's shown
		const shown = () => getComputedStyle(field).display !== "none";
		if (shown()) return build();
		const onResize = () => {
			if (!shown()) return;
			removeEventListener("resize", onResize);
			build();
		};
		addEventListener("resize", onResize);
		cleanups.push(() => removeEventListener("resize", onResize));
	};
	void start();

	return () => {
		disposed = true;
		for (const cleanup of cleanups) cleanup();
	};
}
