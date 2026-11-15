// Accordion headings that drift a few pixels towards the cursor (springed, mouse only, off under
// reduced motion). Two variants: B moves the heading alone (the default, and the only one in
// production); C moves the chevron with it. In dev, ?variant=B|C or the switcher in the dev
// toolbar picks one.
import {
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
} from "motion/react";
import {
	createContext,
	type ComponentProps,
	type PointerEvent,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { AccordionTrigger } from "@/components/ui/accordion";

const VARIANTS = ["B", "C"] as const;
type Variant = (typeof VARIANTS)[number];
const VariantContext = createContext<Variant>("B");
const LABELS = {
	B: "Heading follows · 8px / 5px",
	C: "Heading + chevron follow · 8px / 5px",
};

export function CursorFollow({ children }: { children: ReactNode }) {
	const [variant, setVariant] = useState<Variant>("B");
	// the variant switcher lives in the dev font toolbar (FontToolbar.astro), via this slot
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	useEffect(() => {
		setSlot(document.getElementById("dev-toolbar-slot"));
		const value = new URLSearchParams(location.search).get("variant");
		if (value === "B" || value === "C") setVariant(value);
	}, []);

	if (!import.meta.env.DEV) return children;

	const cycle = (direction: number) => {
		const next =
			VARIANTS[
				(VARIANTS.indexOf(variant) + direction + VARIANTS.length) %
					VARIANTS.length
			];
		setVariant(next);
		const url = new URL(location.href);
		url.searchParams.set("variant", next);
		history.replaceState(history.state, "", url);
	};

	return (
		<VariantContext.Provider value={variant}>
			{children}
			{slot &&
				createPortal(
					<>
						<div
							role="group"
							aria-label="Cursor follow variants"
							className="flex items-center gap-1 px-1.5 py-1.5"
							onKeyDown={(event) => {
								if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
									event.preventDefault();
									cycle(event.key === "ArrowLeft" ? -1 : 1);
								}
							}}
						>
							<button
								type="button"
								aria-label="Previous variant"
								className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none"
								onClick={() => cycle(-1)}
							>
								<i className="ph-bold ph-caret-left" aria-hidden="true" />
							</button>
							<span aria-live="polite" className="text-slate-400">
								Variant <span className="text-primary">{variant}</span>:{" "}
								<span className="text-slate-200">{LABELS[variant]}</span>
							</span>
							<button
								type="button"
								aria-label="Next variant"
								className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none"
								onClick={() => cycle(1)}
							>
								<i className="ph-bold ph-caret-right" aria-hidden="true" />
							</button>
						</div>
					</>,
					slot,
				)}
		</VariantContext.Provider>
	);
}

export function CursorFollowTrigger({
	children,
	icon,
	backdrop,
	...props
}: ComponentProps<typeof AccordionTrigger> & {
	/** rendered inside the trigger, outside the part that follows the cursor (e.g. a background) */
	backdrop?: ReactNode;
}) {
	const variant = useContext(VariantContext);
	const reducedMotion = useReducedMotion();
	const targetX = useMotionValue(0);
	const targetY = useMotionValue(0);
	const x = useSpring(targetX, { stiffness: 220, damping: 24, mass: 0.5 });
	const y = useSpring(targetY, { stiffness: 220, damping: 24, mass: 0.5 });
	const enabled = reducedMotion === false;
	const reset = () => {
		targetX.set(0);
		targetY.set(0);
	};
	const follow = (event: PointerEvent<HTMLButtonElement>) => {
		if (
			!enabled ||
			event.pointerType !== "mouse" ||
			!matchMedia("(hover: hover) and (pointer: fine)").matches
		) {
			reset();
			return;
		}
		const rect = event.currentTarget.getBoundingClientRect();
		const clamp = (value: number) => Math.max(-1, Math.min(1, value));
		targetX.set(clamp(((event.clientX - rect.left) / rect.width) * 2 - 1) * 8);
		targetY.set(clamp(((event.clientY - rect.top) / rect.height) * 2 - 1) * 5);
	};

	return (
		<AccordionTrigger
			{...props}
			onPointerMove={follow}
			onPointerLeave={reset}
			onPointerCancel={reset}
			onBlur={reset}
			icon={
				variant === "C" ? (
					<motion.span
						className="pointer-events-none ml-auto flex shrink-0"
						style={enabled ? { x, y } : { x: 0, y: 0 }}
					>
						{icon}
					</motion.span>
				) : (
					icon
				)
			}
		>
			{backdrop}
			<motion.span
				className="pointer-events-none inline-block"
				style={enabled ? { x, y } : { x: 0, y: 0 }}
			>
				{children}
			</motion.span>
		</AccordionTrigger>
	);
}
