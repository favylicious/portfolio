import "shiki-magic-move/dist/style.css";

import { ShikiMagicMove } from "shiki-magic-move/react";

import { highlighter } from "@util/highlighter";

import type { BundledLanguage } from "shiki/bundle/web";

interface Props {
	code: string;
	lang: BundledLanguage;
	/** skip the token morph animation (prefers-reduced-motion) */
	reduceMotion?: boolean;
}

export const CodeBlock: React.FC<Props> = ({ code, lang, reduceMotion = false }) => {
	return (
		// the wrapper scrolls, so long lines stay reachable on narrow screens instead of being clipped
		<div className="my-8 overflow-x-auto rounded-md border-2 border-gray-600">
			<ShikiMagicMove
				className="w-max min-w-full px-4 sm:px-8 py-6 [&>span]:text-sm [&>span]:font-display"
				lang={lang}
				theme="github-dark-default"
				highlighter={highlighter}
				code={code}
				options={{ duration: reduceMotion ? 0 : 300, stagger: reduceMotion ? 0 : 0.2 }}
			/>
		</div>
	);
};
