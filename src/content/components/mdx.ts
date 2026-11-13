import Link from "./Link.astro";

/**
 * Components that replace markdown elements in every post.
 * Pass to `<Content components={mdxComponents} />`; posts don't need to export their own.
 */
export const mdxComponents = {
	a: Link,
};
