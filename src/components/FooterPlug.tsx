import {
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
} from "motion/react";
import { useEffect, useRef } from "react";

/**
 * A magnetic two-pronged plug for the footer's link headings, drawn side-on: a primary plug body
 * with two prongs pointing right. It trails the pointer while it's inside the footer. Near a
 * heading it's pulled towards that heading's port (`[data-socket]`: the faint rounded frame around
 * the heading), harder the closer the pointer gets; inside the frame it plugs into the middle of
 * the frame's left edge (`data-plugged`), which fills the frame with a dithered wipe
 * (footer-wipe.ts watches that attribute). The plug fades out where it is when the pointer leaves
 * the footer.
 *
 * A wire trails from the back of the plug to a point just off the footer's left edge, level with
 * the links: a Verlet rope (a chain of points that keep their momentum, fall under gravity and are
 * held at a fixed spacing), drawn as a smooth curve through them. Its length eases towards ~5%
 * more than the straight distance, so it always hangs with a little slack (and once plugged in,
 * eases to a perfectly straight run: no slack, no gravity). The free wire is only so long: 20px
 * short of the nearest socket, so the plug strains towards a socket but can't reach it until the
 * pointer is inside the frame; swings and lags behind
 * a fast-moving plug. It only simulates while something is moving.
 *
 * Stacking: the plug and wire sit below the footer's nav (z-10 vs z-20), so they pass behind the
 * heading text. A separate, unrotated clip at the frame's left edge hides the inserted prongs,
 * including while the plug slides in and out. The wire is clipped to the footer.
 *
 * Only for a precise mouse, and not under reduced motion. Purely decorative: aria-hidden, and it
 * never takes pointer events.
 */

/** distance from a heading (and its socket) within which the pull starts, px */
const RADIUS = 140;
/**
 * px from a heading (and its socket) at which the pull is at its strongest; it ramps from 0 at
 * RADIUS to 1 here, steepest near the heading. The plug only seats in a socket when the pointer is
 * inside the socket's frame (until then the wire is too short to reach: WIRE_SHORTFALL).
 */
const SNAP = 24;
/**
 * Where the free plug's centre sits relative to the pointer, px: level with it and to its left, so
 * the prongs point at the cursor with their tips (15.5px right of the centre) 8px short of it.
 */
const OFFSET_X = -24;
const OFFSET_Y = 0;
/**
 * Plug geometry (CSS px, matching the SVG): 44×22, body from x 9 to 28 (outline included), prongs
 * from 28 to 37.5.
 * Plugged in, the body's front face (x 28) meets the socket's left edge, so the plug's centre
 * (x 22) sits 6px left of it.
 */
const PLUG_W = 44;
const PLUG_H = 22;
const PLUGGED_CENTRE_FROM_SOCKET_LEFT = -6;
/**
 * Where the wire joins the plug: just inside the back of the body (x 10 of the SVG, whose back
 * edge is at x 9), so the join is hidden under the body. Measured from the plug's centre (x 22).
 */
const WIRE_ATTACH_FROM_CENTRE = 12;

/** Wire: number of points, slack over the straight distance, gravity (px/frame²), damping */
const WIRE_POINTS = 24;
const WIRE_SLACK = 0.95;
const WIRE_MIN_LENGTH = 100;
const GRAVITY = 0.45;
const DAMPING = 0.85;
const CONSTRAINT_PASSES = 6;
/** where the wire leaves the footer: this far past its left edge, px */
const WIRE_ANCHOR_X = -24;
/**
 * How far short of the nearest socket the wire reaches while the plug is free, px: straining
 * towards a socket, the plug stops this far from it. Moving into the frame lifts the limit and
 * the plug snaps in.
 */
const WIRE_SHORTFALL = 20;
/** how quickly the wire tightens to a straight line once plugged in (and slackens after), per frame */
const TENSION_RATE = 0.8;
/**
 * Plug tilt, degrees: from its vertical speed (per px/s; leaning into the motion, prongs leading),
 * plus a share of the wire's angle where it meets the plug, capped. Fades to 0 as the magnet pull
 * takes over, so it's level when plugged in.
 */
const TILT_PER_SPEED = 0.02;
const TILT_FROM_WIRE = 0.4;
const MAX_TILT = 25;

type Box = { left: number; top: number; right: number; bottom: number };
type Point = { x: number; y: number; px: number; py: number };

/** A smooth path through the points (Catmull–Rom, as cubic Béziers). */
const smoothPath = (points: Point[]) => {
	let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[i - 1] ?? points[i];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[i + 2] ?? p2;
		const c1x = p1.x + (p2.x - p0.x) / 6;
		const c1y = p1.y + (p2.y - p0.y) / 6;
		const c2x = p2.x - (p3.x - p1.x) / 6;
		const c2y = p2.y - (p3.y - p1.y) / 6;
		d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
	}
	return d;
};

const distanceToBox = (x: number, y: number, box: Box) =>
	Math.hypot(
		Math.max(box.left - x, 0, x - box.right),
		Math.max(box.top - y, 0, y - box.bottom),
	);

/**
 * Springs for the plug (stiffness, damping, mass, as in Motion), stepped in the same frame loop as
 * the wire: following the pointer, the much quicker one for snapping into a socket, and the tilt's
 * (underdamped while free, so it sways a little; crisp when snapping level). Retargeting a running
 * spring keeps its velocity, so switching between them mid-move is seamless.
 */
type Spring = { stiffness: number; damping: number; mass: number };
const FOLLOW_SPRING: Spring = { stiffness: 380, damping: 30, mass: 0.6 };
const SNAP_SPRING: Spring = { stiffness: 2200, damping: 54, mass: 0.5 };
const TILT_SPRING: Spring = { stiffness: 220, damping: 14, mass: 0.6 };
const TILT_SNAP_SPRING: Spring = { stiffness: 1800, damping: 56, mass: 0.5 };

/** One damped spring axis: position, velocity (units/s) and the goal it's pulled towards. */
type Axis = { pos: number; vel: number; goal: number };
/** Advances an axis by dt seconds (semi-implicit Euler, in small substeps so stiff springs stay stable). */
const stepSpring = (axis: Axis, spring: Spring, dt: number) => {
	const substeps = Math.max(1, Math.ceil(dt / (1 / 240)));
	const h = dt / substeps;
	for (let i = 0; i < substeps; i++) {
		const force =
			spring.stiffness * (axis.goal - axis.pos) - spring.damping * axis.vel;
		axis.vel += (force / spring.mass) * h;
		axis.pos += axis.vel * h;
	}
};
const settled = (axis: Axis) =>
	Math.abs(axis.vel) < 0.5 && Math.abs(axis.goal - axis.pos) < 0.05;

export default function FooterPlug() {
	const ref = useRef<HTMLDivElement>(null);
	const wireRef = useRef<SVGPathElement>(null);
	const reducedMotion = useReducedMotion();
	// driven by the plug's own springs in the frame loop (see stepSpring)
	const x = useMotionValue(0);
	const y = useMotionValue(0);
	const rotate = useMotionValue(0);
	const opacity = useSpring(0, { stiffness: 300, damping: 30 });
	const clipPath = useMotionValue("none");

	useEffect(() => {
		const footer = ref.current?.closest("footer");
		if (!footer || reducedMotion) return;
		if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;

		const targets = [
			...footer.querySelectorAll<HTMLElement>("[data-socket]"),
		].map((socket) => ({
			socket,
			link: socket.parentElement?.querySelector<HTMLElement>("a") ?? socket,
		}));
		let plugged: HTMLElement | null = null;
		// Keep the last port's clipping plane on unplug, so the prongs emerge as they withdraw.
		let occlusionSocket: HTMLElement | null = null;
		const updateClip = () => {
			if (!occlusionSocket) return;
			const origin = footer.getBoundingClientRect();
			const edge = occlusionSocket.getBoundingClientRect().left;
			// Only the right edge clips; leave space around the free plug and its shadow elsewhere.
			clipPath.set(
				`inset(-44px ${Math.max(0, origin.right - edge)}px -44px -44px)`,
			);
		};
		let shown = false;
		let pointer: { x: number; y: number } | undefined;
		/** the magnet's current hold on the plug, 0 (free) to 1 (seated); tilt fades with it */
		let pull = 0;
		const plugX: Axis = { pos: 0, vel: 0, goal: 0 };
		const plugY: Axis = { pos: 0, vel: 0, goal: 0 };
		const plugTilt: Axis = { pos: 0, vel: 0, goal: 0 };

		const plug = (socket: HTMLElement | null) => {
			if (plugged === socket) return;
			plugged?.removeAttribute("data-plugged");
			socket?.setAttribute("data-plugged", "");
			plugged = socket;
			// the wire tightens (or slackens) whether or not the plug is still moving
			wake();
		};

		const update = () => {
			if (!pointer) return;
			// re-measure: the footer's rise-in moves its content while it scrolls into view
			measureAnchor();
			const origin = footer.getBoundingClientRect();
			let tx = pointer.x + OFFSET_X;
			let ty = pointer.y + OFFSET_Y;
			let nearest: { socket: HTMLElement; distance: number } | undefined;
			let hovered: HTMLElement | null = null;
			for (const { socket, link } of targets) {
				const a = link.getBoundingClientRect();
				const s = socket.getBoundingClientRect();
				// anywhere inside the frame (not just on the heading text): plug into its socket
				if (distanceToBox(pointer.x, pointer.y, s) === 0) hovered = socket;
				// the heading and its socket together are the magnet
				const box = {
					left: Math.min(a.left, s.left),
					top: Math.min(a.top, s.top),
					right: Math.max(a.right, s.right),
					bottom: Math.max(a.bottom, s.bottom),
				};
				const distance = distanceToBox(pointer.x, pointer.y, box);
				if (!nearest || distance < nearest.distance)
					nearest = { socket, distance };
			}
			pull = 0;
			const magnet =
				hovered ??
				(nearest && nearest.distance < RADIUS ? nearest.socket : null);
			if (magnet) occlusionSocket = magnet;
			updateClip();
			if (magnet) {
				const s = magnet.getBoundingClientRect();
				const t = hovered
					? 0
					: Math.max(0, ((nearest?.distance ?? 0) - SNAP) / (RADIUS - SNAP));
				pull = (1 - t) ** 2;
				tx += (s.left + PLUGGED_CENTRE_FROM_SOCKET_LEFT - tx) * pull;
				ty += (s.top + s.height / 2 - ty) * pull;
			}
			plug(hovered);
			// footer-relative, since the plug lives inside the footer
			tx -= origin.left;
			ty -= origin.top;
			// held back short of the sockets: the free plug stops WIRE_SHORTFALL in front of them,
			// staying level with whichever it's being pulled towards (lifted once plugged in)
			if (!plugged) tx = Math.min(tx, frontLimit);
			// tethered: the cord end can't get further from the wire's anchor than the wire reaches,
			// so past that the plug stops, pulled taut towards the pointer
			const cx = tx - WIRE_ATTACH_FROM_CENTRE - anchor.x;
			const cy = ty - anchor.y;
			const reach = Math.hypot(cx, cy);
			// (lifted while plugged in, so the plug can seat)
			if (!plugged && reach > maxLength) {
				const k = maxLength / reach;
				tx = anchor.x + cx * k + WIRE_ATTACH_FROM_CENTRE;
				ty = anchor.y + cy * k;
			}
			plugX.goal = tx;
			plugY.goal = ty;
			if (!shown) {
				// appear where the pointer is, rather than flying in from the last spot
				plugX.pos = tx;
				plugY.pos = ty;
				plugX.vel = plugY.vel = 0;
				x.set(tx);
				y.set(ty);
				shown = true;
				layOut();
			}
			opacity.set(1);
			wake();
		};

		const move = (event: PointerEvent) => {
			if (event.pointerType !== "mouse") return;
			pointer = { x: event.clientX, y: event.clientY };
			update();
		};
		const leave = () => {
			pointer = undefined;
			shown = false;
			opacity.set(0);
			plug(null);
		};

		// --- the wire ---
		const anchor = { x: WIRE_ANCHOR_X, y: 0 };
		/** the free wire's full length: enough to reach the spot just short of each socket */
		let maxLength = Number.POSITIVE_INFINITY;
		/** how far right the free plug's centre may go: WIRE_SHORTFALL short of the sockets */
		let frontLimit = Number.POSITIVE_INFINITY;
		const measureAnchor = () => {
			updateClip();
			const origin = footer.getBoundingClientRect();
			const nav = footer.querySelector("nav")?.getBoundingClientRect();
			anchor.y = nav
				? nav.top + nav.height / 2 - origin.top
				: origin.height / 2;
			// the free plug's furthest spot in front of each socket: level with it, WIRE_SHORTFALL
			// short of where it seats
			const shortOf = targets.map(({ socket }) => {
				const s = socket.getBoundingClientRect();
				return {
					x:
						s.left +
						PLUGGED_CENTRE_FROM_SOCKET_LEFT -
						WIRE_SHORTFALL -
						origin.left,
					y: s.top + s.height / 2 - origin.top,
				};
			});
			if (shortOf.length) {
				frontLimit = Math.min(...shortOf.map((p) => p.x));
				// long enough to reach every one of those spots, so the length limit never pulls the
				// plug out of line with a socket
				maxLength = Math.max(
					...shortOf.map((p) =>
						Math.hypot(
							p.x - WIRE_ATTACH_FROM_CENTRE - anchor.x,
							p.y - anchor.y,
						),
					),
				);
			}
		};
		measureAnchor();
		/** where the wire meets the back of the plug body, footer-relative */
		const cordEnd = () => {
			// the plug turns about its centre, so its back end swings with it
			const angle = (rotate.get() * Math.PI) / 180;
			const back = WIRE_ATTACH_FROM_CENTRE;
			return {
				x: x.get() - Math.cos(angle) * back,
				y: y.get() - Math.sin(angle) * back,
			};
		};
		let points: Point[] = [];
		let length = WIRE_MIN_LENGTH;
		/** 0 = hanging freely, 1 = plugged in and pulled straight; eased between */
		let tension = 0;
		let frame = 0;
		let previousTime = 0;
		let stillFrames = 0;

		const layOut = () => {
			const end = cordEnd();
			points = Array.from({ length: WIRE_POINTS }, (_, i) => {
				const t = i / (WIRE_POINTS - 1);
				const px = anchor.x + (end.x - anchor.x) * t;
				const py = anchor.y + (end.y - anchor.y) * t;
				return { x: px, y: py, px, py };
			});
			length = Math.max(
				Math.hypot(end.x - anchor.x, end.y - anchor.y) * WIRE_SLACK,
				WIRE_MIN_LENGTH,
			);
		};

		const step = (time: number) => {
			frame = 0;
			// woken (by a resize, say) before the pointer has ever entered: nothing to move yet
			if (!points.length) return;
			const elapsed = previousTime
				? Math.min(time - previousTime, 1000 / 30)
				: 1000 / 60;
			const dt = elapsed / (1000 / 60);
			previousTime = time;

			// the plug: follow (or snap to) its goal, and tilt
			const spring = plugged ? SNAP_SPRING : FOLLOW_SPRING;
			stepSpring(plugX, spring, elapsed / 1000);
			stepSpring(plugY, spring, elapsed / 1000);
			stepSpring(
				plugTilt,
				plugged ? TILT_SNAP_SPRING : TILT_SPRING,
				elapsed / 1000,
			);
			x.set(plugX.pos);
			y.set(plugY.pos);
			rotate.set(plugTilt.pos);

			const end = cordEnd();
			const tensionTarget = plugged ? 1 : 0;
			tension += (tensionTarget - tension) * Math.min(TENSION_RATE * dt, 1);
			if (Math.abs(tensionTarget - tension) < 0.001) tension = tensionTarget;
			// plugged in, the slack (and the minimum length) ease away to a straight run
			const distance = Math.hypot(end.x - anchor.x, end.y - anchor.y);
			const slack = WIRE_SLACK + (1 - WIRE_SLACK) * tension;
			const target = Math.max(
				Math.min(
					Math.max(distance * slack, WIRE_MIN_LENGTH * (1 - tension)),
					maxLength,
				),
				distance,
			);
			length += (target - length) * Math.min(0.15 * dt, 1);
			const rest = length / (WIRE_POINTS - 1);

			let motion = 0;
			for (let i = 1; i < points.length - 1; i++) {
				const p = points[i];
				const vx = (p.x - p.px) * DAMPING;
				const vy = (p.y - p.py) * DAMPING;
				p.px = p.x;
				p.py = p.y;
				p.x += vx;
				p.y += vy + GRAVITY * (1 - tension) * dt * dt;
				motion = Math.max(motion, Math.abs(vx) + Math.abs(vy));
			}
			const first = points[0];
			const last = points[points.length - 1];
			for (let pass = 0; pass < CONSTRAINT_PASSES; pass++) {
				first.x = anchor.x;
				first.y = anchor.y;
				last.x = end.x;
				last.y = end.y;
				for (let i = 0; i < points.length - 1; i++) {
					const a = points[i];
					const b = points[i + 1];
					const dx = b.x - a.x;
					const dy = b.y - a.y;
					const d = Math.hypot(dx, dy) || 1;
					const correction = (d - rest) / d / 2;
					const aPinned = i === 0;
					const bPinned = i + 1 === points.length - 1;
					if (!aPinned) {
						a.x += dx * correction * (bPinned ? 2 : 1);
						a.y += dy * correction * (bPinned ? 2 : 1);
					}
					if (!bPinned) {
						b.x -= dx * correction * (aPinned ? 2 : 1);
						b.y -= dy * correction * (aPinned ? 2 : 1);
					}
				}
			}
			first.px = first.x = anchor.x;
			first.py = first.y = anchor.y;
			last.px = last.x = end.x;
			last.py = last.y = end.y;
			wireRef.current?.setAttribute("d", smoothPath(points));

			// tilt: lean into vertical motion, follow the wire a little, level out as the magnet takes over
			const into = points[points.length - 3];
			const wireAngle =
				(Math.atan2(end.y - into.y, end.x - into.x) * 180) / Math.PI;
			const tilt =
				plugY.vel * TILT_PER_SPEED +
				Math.max(-90, Math.min(90, wireAngle)) * TILT_FROM_WIRE;
			plugTilt.goal =
				Math.max(-MAX_TILT, Math.min(MAX_TILT, tilt)) * (1 - pull);

			// settle: stop once nothing has moved for half a second (wake() restarts it)
			stillFrames =
				motion < 0.02 &&
				settled(plugX) &&
				settled(plugY) &&
				settled(plugTilt) &&
				tension === (plugged ? 1 : 0) &&
				Math.abs(length - target) < 0.5
					? stillFrames + 1
					: 0;
			if (stillFrames < 30) frame = requestAnimationFrame(step);
		};
		const wake = () => {
			stillFrames = 0;
			if (!frame) {
				previousTime = 0;
				frame = requestAnimationFrame(step);
			}
		};
		const resize = new ResizeObserver(() => {
			measureAnchor();
			wake();
		});
		resize.observe(footer);

		const controller = new AbortController();
		const { signal } = controller;
		footer.addEventListener("pointermove", move, { signal });
		footer.addEventListener("pointerleave", leave, { signal });
		// the footer moves under a still pointer while scrolling
		addEventListener("scroll", update, { passive: true, signal });
		return () => {
			controller.abort();
			cancelAnimationFrame(frame);
			resize.disconnect();
			clipPath.set("none");
			plug(null);
		};
	}, [reducedMotion, x, y, opacity, rotate, clipPath]);

	return (
		<>
			{/* the wire: clipped to the footer, so it enters from the left edge */}
			<motion.svg
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-hidden text-primary"
				style={{ opacity }}
			>
				<path
					ref={wireRef}
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</motion.svg>
			{/* Clip in footer coordinates, outside the plug's translating/rotating element. */}
			<motion.div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 z-10"
				style={{ clipPath }}
			>
				<motion.div
					ref={ref}
					aria-hidden="true"
					className="pointer-events-none absolute top-0 left-0 z-10 -translate-x-1/2 -translate-y-1/2 text-primary drop-shadow-[0_0_8px_rgb(255_226_146/0.45)]"
					style={{ x, y, rotate, opacity, width: PLUG_W, height: PLUG_H }}
				>
					<svg
						viewBox="0 0 44 22"
						width={PLUG_W}
						height={PLUG_H}
						fill="currentColor"
					>
						{/* body: a squared-off semicircle (D shape), its flat face at the front where the
				    prongs come out and a full, squarish curve at the back where the cord goes in.
				    Filled, with the same 2px outline as the socket (so the two match in size); the path
				    sits 1px in so the stroke's outer edge is the body's front face, at x 28 */}
						<path
							d="M16.3 1H25.5Q27 1 27 2.5V19.5Q27 21 25.5 21H16.3C11.2 21 10 17.5 10 11C10 4.5 11.2 1 16.3 1Z"
							fill="currentColor"
							stroke="currentColor"
							strokeWidth="2"
						/>
						{/* prongs, from the front face */}
						<rect x="27.5" y="5" width="10" height="3" rx="1" />
						<rect x="27.5" y="14" width="10" height="3" rx="1" />
					</svg>
				</motion.div>
			</motion.div>
		</>
	);
}
