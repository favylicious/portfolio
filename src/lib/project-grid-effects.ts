import { createDitherGlow, type DitherGlow } from "./dither-glow";

/**
 * Cursor glow for one grid, drawn (dithered, on the GPU) into `glowHost`, an element covering the
 * grid. Return cleanup for Astro's client-side page swaps.
 */
export function attachProjectGridEffects(
	grid: HTMLElement,
	glowHost: HTMLElement,
) {
	const controller = new AbortController();
	const { signal } = controller;
	const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
	const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
	let frame = 0;
	let previousTime = 0;
	let inside = false;
	let x = 0;
	let y = 0;
	let opacity = 0;
	let targetX = 0;
	let targetY = 0;
	let targetOpacity = 0;
	let lastPointer: { x: number; y: number } | undefined;
	// created on first use, so touch devices (which never get the glow) don't spin up WebGL
	let glow: DitherGlow | undefined;

	const paint = () => {
		if (!glow && opacity === 0) return;
		glow ??= createDitherGlow(glowHost);
		glow.update(x, y, 179 * opacity, opacity);
	};

	const animate = (time: number) => {
		frame = 0;
		const elapsed = previousTime ? time - previousTime : 16;
		previousTime = time;
		const follow = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / 85);
		x += (targetX - x) * follow;
		y += (targetY - y) * follow;
		opacity += (targetOpacity - opacity) * follow;
		const settled =
			Math.abs(targetX - x) < 0.1 &&
			Math.abs(targetY - y) < 0.1 &&
			Math.abs(targetOpacity - opacity) < 0.001;
		if (settled) {
			x = targetX;
			y = targetY;
			opacity = targetOpacity;
		}
		paint();
		if (!settled) frame = requestAnimationFrame(animate);
	};

	const schedule = () => {
		if (frame) return;
		previousTime = 0;
		frame = requestAnimationFrame(animate);
	};

	const leave = () => {
		inside = false;
		targetOpacity = 0;
		delete grid.dataset.pointerActive;
		schedule();
	};

	const updatePosition = (clientX: number, clientY: number) => {
		const rect = grid.getBoundingClientRect();
		if (
			!rect.width ||
			!rect.height ||
			clientX < rect.left ||
			clientX > rect.right ||
			clientY < rect.top ||
			clientY > rect.bottom
		) {
			leave();
			return;
		}
		targetX = clientX - rect.left;
		targetY = clientY - rect.top;
		// Full size at 5% inward, shrinking gradually to zero at 1% inward.
		const edgeDistance = Math.min(
			targetX / rect.width,
			1 - targetX / rect.width,
			targetY / rect.height,
			1 - targetY / rect.height,
		);
		const intensity = Math.max(0, Math.min(1, (edgeDistance - 0.01) / 0.04));
		targetOpacity = intensity * intensity * (3 - 2 * intensity);
		if (!inside) {
			x = targetX;
			y = targetY;
			inside = true;
		}
		grid.dataset.pointerActive = "";
		schedule();
	};
	const move = (event: PointerEvent) => {
		if (event.pointerType !== "mouse" || !finePointer.matches) return;
		lastPointer = { x: event.clientX, y: event.clientY };
		updatePosition(event.clientX, event.clientY);
	};
	const refreshPosition = () => {
		if (inside && lastPointer) updatePosition(lastPointer.x, lastPointer.y);
	};

	grid.addEventListener("pointerenter", move, { signal });
	grid.addEventListener("pointermove", move, { signal });
	grid.addEventListener("pointerleave", leave, { signal });
	grid.addEventListener("pointercancel", leave, { signal });
	// Scroll changes the grid's viewport position even when the pointer stays still.
	window.addEventListener("scroll", refreshPosition, { passive: true, signal });
	window.addEventListener("resize", refreshPosition, { signal });
	window.addEventListener("blur", leave, { signal });
	finePointer.addEventListener("change", leave, { signal });
	reducedMotion.addEventListener("change", leave, { signal });

	return () => {
		controller.abort();
		cancelAnimationFrame(frame);
		delete grid.dataset.pointerActive;
		glow?.dispose();
	};
}
