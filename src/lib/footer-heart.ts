/** Magic UI ConfettiButton's canvas-confetti origin calculation, triggered every ten heart clicks.
 * https://magicui.design/docs/components/confetti
 * The canvas lives above the page, outside the footer's scroll-linked clipping.
 */
export function attachFooterHeart(heart: HTMLButtonElement) {
	const controller = new AbortController();
	const { signal } = controller;
	let clicks = 0;
	let disposed = false;
	let beatTimeout = 0;
	let confetti: typeof import("canvas-confetti") | undefined;

	const celebrate = async () => {
		try {
			confetti ??= (await import("canvas-confetti")).default;
			if (disposed || !heart.isConnected) return;
			const rect = heart.getBoundingClientRect();
			void confetti({
				particleCount: 100,
				spread: 75,
				startVelocity: 35,
				origin: {
					x: (rect.left + rect.width / 2) / window.innerWidth,
					y: (rect.top + rect.height / 2) / window.innerHeight,
				},
				colors: ["#ffe292", "#ffab40", "#f472b6", "#a78bfa", "#38bdf8"],
				zIndex: 9999,
				disableForReducedMotion: true,
			});
		} catch (error) {
			console.error("Footer confetti could not start:", error);
		}
	};

	heart.addEventListener(
		"click",
		() => {
			clicks += 1;
			if (clicks % 10 === 0) void celebrate();

			clearTimeout(beatTimeout);
			delete heart.dataset.beat;
			void heart.offsetWidth;
			heart.dataset.beat = "";
			if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
				beatTimeout = window.setTimeout(() => delete heart.dataset.beat, 500);
			}
		},
		{ signal },
	);
	heart.addEventListener(
		"animationend",
		(event) => {
			if (event.target === heart) delete heart.dataset.beat;
		},
		{ signal },
	);

	return () => {
		disposed = true;
		controller.abort();
		clearTimeout(beatTimeout);
		delete heart.dataset.beat;
		confetti?.reset();
	};
}
