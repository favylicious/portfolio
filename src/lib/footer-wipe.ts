/**
 * The footer links' fill: while the plug is seated in a link's frame (FooterPlug sets data-plugged
 * on its [data-socket]), the frame fills with the accordion's dithered wipe (dither-wipe.ts), here
 * as a ring spreading from where the plug goes in, the middle of the frame's left edge. Unplugging
 * sends the fill out to the right the same way.
 *
 * Each socket is followed by a [data-footer-wipe] host covering the frame. While a frame is filled
 * its list item carries data-wiped, which the link uses to turn its text dark.
 * Returns cleanup.
 */
import { createDitherWipe } from "./dither-wipe";

export function attachFooterWipe(footer: HTMLElement) {
	const cleanups: (() => void)[] = [];
	for (const socket of footer.querySelectorAll<HTMLElement>("[data-socket]")) {
		const item = socket.parentElement;
		const host = item?.querySelector<HTMLElement>("[data-footer-wipe]");
		if (!item || !host) continue;
		// the ring's dithered ramp, as wide as the accordion's now that the frame spans the column;
		// a quicker crossing than the accordion's
		const wipe = createDitherWipe(host, { shape: "radial", band: 280, duration: 900 });
		const sync = () => {
			const plugged = socket.hasAttribute("data-plugged");
			item.toggleAttribute("data-wiped", wipe.setActive(plugged) && plugged);
		};
		const observer = new MutationObserver(sync);
		observer.observe(socket, { attributes: true, attributeFilter: ["data-plugged"] });
		sync();
		cleanups.push(() => {
			observer.disconnect();
			item.removeAttribute("data-wiped");
			wipe.dispose();
		});
	}
	return () => {
		for (const cleanup of cleanups) cleanup();
	};
}
