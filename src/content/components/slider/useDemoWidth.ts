import { useEffect, useRef, useState } from "react";

/** Narrowest the resizable demo box gets; matches its `min-w-48`. */
const MIN_WIDTH = "12rem";

/**
 * Drives a resizable demo box from a 0–100 slider. The slider covers the box's real range:
 * 0 is the minimum width and 100 is the full width of its parent, so every step changes the
 * size (a plain `${value}%` stops changing once it hits the min-width). Also reports the
 * rendered width in px for the label.
 */
export const useDemoWidth = (initial = 100) => {
	const [value, setValue] = useState(initial);
	const [px, setPx] = useState<number | null>(null);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const observer = new ResizeObserver(() => setPx(Math.round(el.getBoundingClientRect().width)));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const style = { width: `calc(${MIN_WIDTH} + (100% - ${MIN_WIDTH}) * ${value / 100})` };
	const label = px === null ? `${value}%` : `${px}px`;

	return { ref, style, value, setValue, label };
};
