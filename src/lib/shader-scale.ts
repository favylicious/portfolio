import type { ShaderMount } from "@paper-design/shaders";

/** the dither shaders' dot size, CSS px: they render one canvas pixel per dot */
export const DITHER_DOT_PX = 2;

/**
 * Keeps a Paper ShaderMount's canvas at a fixed resolution, whatever the screen's pixel ratio:
 * one canvas pixel per `cssPxPerPixel` CSS pixels each way (1 by default). Rendering at the device
 * ratio instead (Paper's minPixelRatio is only a minimum) shades many times the pixels for the
 * same picture. Paper's pixel-count cap is the lever: it's kept equal to the host's CSS area
 * divided by cssPxPerPixel squared.
 *
 * The dither shaders pass DITHER_DOT_PX, so every dot is shaded once; the canvas is scaled up
 * without smoothing, so the dots stay sharp.
 *
 * Returns cleanup. Use `cssPixelCount(host, cssPxPerPixel)` for the constructor's maxPixelCount
 * so the first frame is already at that resolution.
 */
export const cssPixelCount = (host: HTMLElement, cssPxPerPixel = 1) =>
	Math.max(
		1,
		Math.round(host.offsetWidth / cssPxPerPixel) * Math.round(host.offsetHeight / cssPxPerPixel),
	);

export function renderAtCssResolution(mount: ShaderMount, host: HTMLElement, cssPxPerPixel = 1) {
	mount.canvasElement.style.imageRendering = "pixelated";
	let count = cssPixelCount(host, cssPxPerPixel);
	const observer = new ResizeObserver(() => {
		const next = cssPixelCount(host, cssPxPerPixel);
		if (next === count) return;
		count = next;
		mount.setMaxPixelCount(next);
	});
	observer.observe(host);
	return () => observer.disconnect();
}

/** Resolves once an image (Paper's noise texture, say) is fully loaded: its shaders need that. */
export const imageLoaded = (image: HTMLImageElement) =>
	image.complete && image.naturalWidth > 0
		? Promise.resolve()
		: new Promise<void>((resolve, reject) => {
				image.addEventListener("load", () => resolve(), { once: true });
				image.addEventListener("error", () => reject(), { once: true });
			});
