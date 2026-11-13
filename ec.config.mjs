import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import ecTwoSlash from "expressive-code-twoslash";
import { defineEcConfig } from "astro-expressive-code";
import { pluginCodeCaption } from "@fujocoded/expressive-code-caption";

export default defineEcConfig({
	plugins: [pluginCollapsibleSections(), pluginCodeCaption(), ecTwoSlash()],
	themes: ["github-dark-default"],
	// The outer frame (border, ring, margins) comes from the site, see src/styles/prose.css.
	// Everything inside the block is configured here rather than overridden with CSS.
	styleOverrides: {
		borderWidth: "0px",
		borderRadius: "0.375rem",
		codeBackground: "rgb(0 0 0 / 0.2)",
		codePaddingBlock: "1.5rem",
		codePaddingInline: "1.85rem",
		frames: {
			editorTabBorderRadius: "0.25rem",
			editorActiveTabIndicatorHeight: "0px",
		},
	},
});
