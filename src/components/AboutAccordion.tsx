import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import {
	type ComponentProps,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { attachDitherWipe } from "@/lib/dither-wipe";
import { cn } from "@/lib/utils";
import { CursorFollow, CursorFollowTrigger } from "./CursorFollow";

// One island for the whole accordion: Astro hydrates each React component separately, so the
// compound parts must live in the same React tree to share the accordion's context.
/** An image or a video (by its extension: .mp4 or .webm), as a path under public/. */
type Media = { src: string; alt: string };
/** a stable empty list, so the carousel can tell "nothing" from a new set */
const NO_MEDIA: Media[] = [];
const isVideo = (src: string) => /\.(mp4|webm)$/i.test(src);

const SECTIONS: {
	value: string;
	title: string;
	body: string;
	/** shown in the carousel while this section is the active one, in this order */
	media: Media[];
}[] = [
	{
		value: "developer",
		title: "developer.",
		body: "I make software for myself and other developers.",
		media: [],
	},
	{
		value: "student",
		title: "student.",
		body: "I'm currently studying at SMU, pursuing a degree in Information Systems. Previously, I was at Temasek Polytechnic, studying IT. That was when my love for programming bloomed.",
		media: [],
	},
	{
		value: "hobbyist",
		title: "hobbyist.",
		body: "In my free time, I play the guitar and a sprinkle of piano. I also boulder on the side.",
		media: [
			{
				src: "/assets/hero/boulder_wall.jpg",
				alt: "Colourful holds on an indoor bouldering wall.",
			},
			{
				src: "/assets/hero/boulder_friends.jpg",
				alt: "Six friends posing in front of a bouldering wall.",
			},
		],
	},
];

// matches the site's --ease-in-cubic
const EASE = [0.18, 0.89, 0.23, 1] as const;

/**
 * Delay before the carousel fades in when it appears (opening a panel from all-closed): the
 * accordion narrows first to make room, then the carousel follows. Leaving isn't staggered: the
 * fade and the accordion widening run together.
 */
const STAGGER_S = 0.2;

/**
 * Panel animated by Motion instead of shadcn's CSS keyframes (AccordionContent). Base UI keeps the
 * panel mounted and renders it as a motion.div, handing over its open state.
 *
 * Height: the panel is a one-row grid and Motion animates grid-template-rows between 0fr and 1fr
 * (the inner wrapper has min-h-0 so the row can shrink below its content). The row is always that
 * fraction of the content's *live* height, so it follows the text when it rewraps mid-animation,
 * e.g. while the carousel slides in and narrows the accordion. Animating `height` to "auto" instead
 * measures the content once, at the start, and snaps to the real height when it finishes.
 *
 * Base UI's own `hidden` is dropped: it hides the panel the moment it closes (before Motion's
 * collapse has started, so it never sees an animation to wait for), which would cut the close
 * short. The collapsed panel (0fr, overflow hidden) is made `inert` instead, which keeps its
 * content out of the tab order and the accessibility tree like `hidden` would.
 */
function AnimatedPanel({ children }: { children: ReactNode }) {
	return (
		<AccordionPrimitive.Panel
			keepMounted
			data-slot="accordion-content"
			render={({ hidden: _hidden, ...props }, state) => (
				<motion.div
					{...(props as ComponentProps<typeof motion.div>)}
					inert={!state.open}
					initial={false}
					animate={
						state.open
							? { gridTemplateRows: "1fr", opacity: 1 }
							: { gridTemplateRows: "0fr", opacity: 0 }
					}
					transition={{
						gridTemplateRows: { duration: 0.6, ease: EASE },
						opacity: { duration: 0.4 },
					}}
					style={{ display: "grid", overflow: "hidden" }}
				/>
			)}
		>
			<div className="min-h-0">
				<div className="pt-4 pb-10">{children}</div>
			</div>
		</AccordionPrimitive.Panel>
	);
}

/**
 * Chevron that turns to point up when its section opens. Sized in em of the heading, so it scales
 * with it (about half the heading's height); same easing as the panel, but a slower 1s turn.
 */
function AnimatedChevron({ open }: { open: boolean }) {
	return (
		<motion.span
			aria-hidden="true"
			// inherits the trigger colour, so it follows the hover/open colour changes
			className="ml-auto flex shrink-0"
			initial={false}
			// negative: turns anticlockwise on open (and back clockwise on close)
			animate={{ rotate: open ? -180 : 0 }}
			transition={{ duration: 1, ease: EASE }}
		>
			<ChevronDownIcon className="size-[0.5em]" strokeWidth={1.5} />
		</motion.span>
	);
}

/**
 * The heading's hover fill: a canvas behind the trigger's content, drawn by the Magic UI dither
 * shader (dither-wipe.ts), which takes over from the CSS `dither-wipe` fallback once attached.
 */
function DitherWipe() {
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		const host = ref.current;
		const trigger = host?.closest<HTMLElement>("button");
		if (!host || !trigger) return;
		return attachDitherWipe(trigger, host);
	}, []);
	return (
		<span
			ref={ref}
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 -z-10"
		/>
	);
}

const CAROUSEL_BUTTON =
	"absolute top-1/2 grid size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-secondary/60 text-white backdrop-blur-sm transition-colors hover:bg-secondary/80 focus-visible:ring-3 focus-visible:outline-none";

/**
 * The active section's images and videos, in a 4:5 frame beside the accordion (below it when
 * stacked). One shows at a time, cross-fading; with more than one there are previous/next buttons
 * and a dot per item.
 *
 * Shown only while `media` isn't empty. While it slides away it keeps showing what it last had.
 * Motion animates two CSS variables (0 = hidden, 1 = shown)
 * and the classes derive everything from them:
 * - --w: the column's width (lg) or height (stacked, below lg), which collapses to 0 so the
 *   accordion takes the freed space
 * - --p: the frame's fade and slide to the right
 * When appearing, the frame waits STAGGER_S for the space to open up; leaving, both run together.
 * The frame's own size is fixed in container units (cqw, against the row), so it doesn't squash.
 * On lg it sits at the column's left edge, just past the accordion, and isn't clipped by the column:
 * as the column narrows the frame is pushed right ahead of the widening accordion (so the two never
 * overlap) and overflows the row to the right, fading as it goes; the page section clips it at the
 * viewport edge. Stacked, the column clips it
 * (overflow-clip, which unlike hidden doesn't break sticky) so it can't spill into what follows.
 */
function Carousel({
	media,
	reducedMotion,
}: { media: Media[]; reducedMotion: boolean }) {
	const shown = media.length > 0;
	// what's on show, and which item: a new set starts from its first item, and an empty one
	// (hiding) leaves the last set in place while the frame slides away
	const [view, setView] = useState({ media, index: 0 });
	if (shown && view.media !== media) setView({ media, index: 0 });
	const items = view.media;
	const step = (by: number) =>
		setView(({ media, index }) => ({
			media,
			index: (index + by + media.length) % media.length,
		}));

	return (
		<motion.section
			aria-roledescription="carousel"
			aria-label="Photos"
			inert={!shown}
			initial={false}
			animate={
				{ "--w": shown ? 1 : 0, "--p": shown ? 1 : 0 } as Record<string, number>
			}
			// per-value transitions: only the fade-in (--p, appearing) is delayed
			transition={{
				"--w": { duration: reducedMotion ? 0 : 0.5, ease: EASE },
				"--p": {
					duration: reducedMotion ? 0 : 0.5,
					ease: EASE,
					delay: shown && !reducedMotion ? STAGGER_S : 0,
				},
			}}
			className={cn(
				"flex shrink-0 self-start lg:sticky lg:top-28",
				"max-lg:mt-[calc(var(--w)*3rem)] max-lg:h-[calc(var(--w)*125cqw)] max-lg:w-full max-lg:overflow-clip",
				"lg:ml-[calc(var(--w)*3rem)] lg:w-[calc(var(--w)*45cqw)]",
			)}
		>
			<div className="relative aspect-4/5 w-[100cqw] shrink-0 translate-x-[calc((1-var(--p))*6rem)] overflow-hidden rounded-2xl bg-slate-900/40 opacity-(--p) lg:w-[45cqw]">
				{items.map(({ src, alt }, i) => {
					const current = i === view.index;
					// stacked; only the current one is visible (and exposed to assistive tech)
					const className = cn(
						"absolute inset-0 size-full object-cover transition-opacity duration-500 motion-reduce:transition-none",
						current ? "opacity-100" : "opacity-0",
					);
					return isVideo(src) ? (
						<video
							key={src}
							src={src}
							aria-label={alt}
							aria-hidden={!current}
							className={className}
							muted
							loop
							playsInline
							autoPlay
						/>
					) : (
						<img
							key={src}
							src={src}
							alt={alt}
							aria-hidden={!current}
							loading="lazy"
							decoding="async"
							className={className}
						/>
					);
				})}
				{items.length > 1 && (
					<>
						<button
							type="button"
							aria-label="Previous"
							onClick={() => step(-1)}
							className={cn(CAROUSEL_BUTTON, "left-4")}
						>
							<ChevronLeftIcon aria-hidden="true" className="size-5" />
						</button>
						<button
							type="button"
							aria-label="Next"
							onClick={() => step(1)}
							className={cn(CAROUSEL_BUTTON, "right-4")}
						>
							<ChevronRightIcon aria-hidden="true" className="size-5" />
						</button>
						<div
							aria-hidden="true"
							className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2"
						>
							{items.map(({ src }, i) => (
								<span
									key={src}
									className={cn(
										"h-2 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none",
										i === view.index ? "w-6 bg-white" : "w-2 bg-white/50",
									)}
								/>
							))}
						</div>
					</>
				)}
			</div>
		</motion.section>
	);
}

export default function AboutAccordion() {
	// controlled so each chevron (and the carousel) knows which sections are open
	const [open, setOpen] = useState<string[]>([]);
	// MotionConfig's reducedMotion covers transforms but not the carousel's CSS-variable tween
	const reducedMotion = useReducedMotion() ?? false;
	// the active section: the most recently opened one that has anything to show (Base UI appends
	// to `open` as sections open). None, and the carousel hides.
	const activeMedia =
		open
			.map((value) => SECTIONS.find((section) => section.value === value)?.media)
			.findLast((media) => media?.length) ?? NO_MEDIA;

	return (
		// honour prefers-reduced-motion: Motion then skips the panel and chevron animations
		<CursorFollow>
			<MotionConfig reducedMotion="user">
				{/* @container: the carousel sizes itself against this row's width (cqw) */}
				<div className="@container flex flex-col lg:flex-row">
					<div className="w-full min-w-0 lg:flex-1">
						{/* lead-in that reads into each heading ("i am a / developer."); a small mono label
						    so it sits in front of the big serif headings rather than competing with them */}
						<p className="mb-3 font-display text-lg tracking-widest text-muted-foreground">
							i am a
						</p>
						<Accordion
							value={open}
							onValueChange={(value) => setOpen(value as string[])}
						>
							{SECTIONS.map(({ value, title, body }) => (
								<AccordionItem key={value} value={value}>
									{/* display-heading sizing on the trigger; tracking/colour reset because the site's base
							    styles give the h3 that wraps the trigger mono-font letter-spacing and the accent colour.
							    Hover/keyboard focus: a dithered take on the navbar links' wipe (dither-wipe in
							    tailwind.css), a bg-primary fill sweeping in from the left behind a dithered edge, with
							    the text turning dark; slower than the nav's 150ms (1s, text colour on the same 1s ease-out curve, so it tracks the fill) since the
							    fill crosses the full content width. Open section: text-primary, unless
							    it's being hovered/focused (then the wipe colours win). -mx-4/px-4 gives the fill
							    some room without shifting the heading out of line with the text below. */}
									<CursorFollowTrigger
										icon={<AnimatedChevron open={open.includes(value)} />}
										backdrop={<DitherWipe />}
										className={cn(
											"isolate -mx-4 items-center overflow-hidden rounded-xs px-4 py-6 font-serif text-5xl font-normal leading-[1.1] tracking-normal text-foreground transition-colors duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] hover:no-underline lg:text-7xl",
											// CSS fallback for the fill until DitherWipe's shader attaches (tailwind.css)
											"dither-wipe",
											"hover:text-secondary focus-visible:text-secondary",
											"aria-expanded:not-hover:not-focus-visible:text-primary",
										)}
									>
										{title}
									</CursorFollowTrigger>
									<AnimatedPanel>
										{/* capped (lg) at the accordion's width while the carousel is shown: the text
										    then never rewraps as the carousel slides in or out, so the panel
										    height can't step a line (sections without media keep the same cap) */}
										<p className="max-w-3xl text-2xl lg:max-w-[calc(55cqw-3rem)]">
											{body}
										</p>
									</AnimatedPanel>
								</AccordionItem>
							))}
						</Accordion>
					</div>
					<Carousel media={activeMedia} reducedMotion={reducedMotion} />
				</div>
			</MotionConfig>
		</CursorFollow>
	);
}
