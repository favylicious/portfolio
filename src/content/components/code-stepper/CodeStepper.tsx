import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { cn } from "src/util/cn";

import { CodeBlock } from "./CodeBlock";

import type { ComponentProps, JSX } from "react";
import type { BundledLanguage } from "shiki/bundle/web";
type Props = ComponentProps<"div"> &
	Record<`${string}-step-${string}`, JSX.Element> & {
		stepId: string;
		code: string[];
		lang: BundledLanguage;
	};

// Same convention as twoslash code blocks: lines up to and including `// ---cut---` are
// context for the reader's editor/types and aren't shown.
const CUT_MARKER = /^[\s\S]*?^\/\/ ---cut---[ \t]*\r?\n/m;
const stripCut = (source: string) => source.replace(CUT_MARKER, "");

export const CodeStepper: React.FC<Props> = ({ stepId, code, lang }) => {
	const [step, setStep] = useState(0);
	const steps = useMemo(() => code.map(stripCut), [code]);

	const ticker = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
	const tickerOffset = 32;

	const stepVisual = step + 1;
	const shouldReduceMotion = useReducedMotion();

	const paginate = (direction: -1 | 1) => {
		setStep(step => step + direction);
	};

	return (
		<div
			// biome-ignore lint/a11y/noNoninteractiveTabindex: create a focusable context for arrow keys
			tabIndex={0}
			aria-label="Code walkthrough, use the left and right arrow keys to change step"
			className="w-full flex flex-col rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-primary/60"
			onKeyDown={e => {
				switch (e.key) {
					case "ArrowLeft": {
						if (step !== 0) {
							paginate(-1);
						}

						return;
					}
					case "ArrowRight": {
						if (step !== code.length - 1) {
							paginate(1);
						}

						return;
					}
				}
			}}
		>
			<div className="mt-8 px-12 flex items-center justify-center space-x-6">
				<button
					type="button"
					disabled={step === 0}
					aria-label="Previous step"
					onClick={() => paginate(-1)}
					className={cn(
						"p-2 flex justify-center items-center",
						"bg-gray-900 hover:bg-slate-700 disabled:bg-transparent",
						"text-gray-300 disabled:text-gray-600 text-xl",
						"border-2 border-slate-700 disabled:border-slate-800",
						"not-disabled:active:scale-95 not-disabled:hover:scale-105",
						"rounded-lg transition"
					)}
				>
					<i aria-hidden="true" className="ph-bold ph-caret-left">previous</i>
				</button>
				<div className="flex h-8 text-center text-2xl text-primary font-bold font-display [&_span]:block [&_span]:leading-[32px] overflow-y-hidden">
					<div className="mr-2 text-white">Step </div>
					<motion.div
						transition={shouldReduceMotion ? { duration: 0 } : undefined}
						animate={{
							y: -Math.floor(stepVisual / 10) * tickerOffset,
						}}
					>
						{ticker.map(d => (
							<span key={`${stepId}-step-${d}-left`}>{d}</span>
						))}
					</motion.div>
					<motion.div
						initial={{ y: -32 }}
						transition={shouldReduceMotion ? { duration: 0 } : undefined}
						animate={{
							y: -Math.round(((stepVisual / 10) % 1) * 10) * tickerOffset,
						}}
					>
						{ticker.map(d => (
							<span key={`${stepId}-step-${d}-right`}>{d}</span>
						))}
					</motion.div>
				</div>
				<button
					type="button"
					disabled={step === code.length - 1}
					aria-label="Next step"
					onClick={() => paginate(1)}
					className={cn(
						"p-2 flex justify-center items-center",
						"bg-gray-900 hover:bg-slate-700 disabled:bg-transparent",
						"text-gray-300 disabled:text-gray-600 text-xl",
						"border-2 border-slate-700 disabled:border-slate-800",
						"not-disabled:active:scale-95 not-disabled:hover:scale-105",
						"rounded-lg transition"
					)}
				>
					<i aria-hidden="true" className="ph-bold ph-caret-right">next</i>
				</button>
			</div>
			{/* one persistent instance, so shiki-magic-move morphs from the previous step's tokens */}
			<div className="mx-4 sm:mx-8">
				<CodeBlock code={steps[step]} lang={lang} reduceMotion={shouldReduceMotion ?? false} />
			</div>
		</div>
	);
};
