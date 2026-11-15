import { file, glob } from "astro/loaders";
import { z } from "astro/zod";
import { defineCollection, getCollection, reference } from "astro:content";

import type { CollectionEntry } from "astro:content";
import { parseDate } from "./util/date";

// Frontmatter dates are parsed with date-fns (see util/date). Quoted values arrive as strings;
// unquoted YAML dates arrive as a Date at UTC midnight, which keeps its instant.
const dateField = z.union([z.string(), z.date()]).transform((value, ctx) => {
    try {
        return parseDate(value instanceof Date ? value.toISOString() : value);
    } catch (error) {
        ctx.addIssue({ code: "custom", message: (error as Error).message });
        return z.NEVER;
    }
});

const post = z.object({
    title: z.string(),
    description: z.string(),
    pubDate: dateField,
    draft: z.boolean().optional().default(false),
    tags: z.array(reference("tags")).default([]),
    related: z
        .object({
            blog: z.array(reference("blog")).default([]),
            projects: z.array(reference("projects")).default([]),
        })
        .default({ blog: [], projects: [] }),
});

const blog = defineCollection({
    loader: glob({
        pattern: "**/*.mdx",
        base: "./src/content/blog",
    }),
    schema: post,
});

const projects = defineCollection({
    loader: glob({
        pattern: "**/*.mdx",
        base: "./src/content/projects",
    }),
    schema: z
        .object({
            url: z.string().optional(),
            githubUrl: z.string().optional(),
        })
        .extend(post.shape),
});

const tags = defineCollection({
    loader: file("./src/content/tags.json"),
    schema: z.object({
        id: z.string(),
        iconUrl: z.url(),
    }),
});

// Journey timeline (JourneyTimeline.astro). No `end` = the current entry; `future` = a planned entry on
// the road ahead (drawn dashed, labelled "next").
const journey = defineCollection({
    loader: file("./src/content/journey.json"),
    // logo: path relative to journey.json, e.g. "../assets/journey/govtech.png"
    schema: ({ image }) => z.object({
        id: z.string(),
        role: z.string(),
        company: z.string(),
        logo: image().optional(),
        location: z.string().optional(),
        start: dateField,
        end: dateField.optional(),
        future: z.boolean().default(false),
        // may contain inline links in Markdown form: "worked on [LifeSG](https://www.life.gov.sg)"
        summary: z.string(),
        tags: z.array(reference("tags")).default([]),
    }),
});

export type BlogPost = CollectionEntry<"blog">;
export type Project = CollectionEntry<"projects">;
export type Tag = CollectionEntry<"tags">;
export type Journey = CollectionEntry<"journey">;

export const getProjects = async (options?: { withDraft: true }): Promise<Project[]> => {
    const withDraft = options?.withDraft;
    const projects = await getCollection("projects");

    if (withDraft) {
        return projects;
    }

    return projects.filter(p => !p.data.draft);
};

export const getBlogPosts = async (options?: { withDraft: true }) => {
    const withDraft = options?.withDraft;
    const blogPosts = await getCollection("blog");

    if (withDraft) {
        return blogPosts;
    }

    return blogPosts.filter(p => !p.data.draft);
};

export const getTags = async (): Promise<Tag[]> => {
    const tags = await getCollection("tags");
    return tags;
};

/** Oldest first, planned (future) entries last. */
export const getJourney = async (): Promise<Journey[]> => {
    const journey = await getCollection("journey");
    return journey.sort(
        (a, b) =>
            Number(a.data.future) - Number(b.data.future) ||
            a.data.start.getTime() - b.data.start.getTime(),
    );
};

export const collections = { blog, projects, tags, journey };
