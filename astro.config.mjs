// @ts-check
import { defineConfig } from "astro/config";
import remarkSectionize from "remark-sectionize";

import mdx from "@astrojs/mdx";

import expressiveCode from "astro-expressive-code";
import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";
import remarkLastUpdatedTime from "./src/util/plugins/last-updated-time.mjs";
import { unified } from "@astrojs/markdown-remark";

// https://astro.build/config
export default defineConfig({
    vite: {
        plugins: [tailwindcss()],
        // loaded on demand (the footer heart's confetti): pre-bundle it at startup, or the dev
        // server only discovers it at that first import and answers "504 Outdated Optimize Dep"
        optimizeDeps: {
            include: ["canvas-confetti"],
        },
        server: {
            allowedHosts: ["dev.favteo.com"],
        },
    },
    integrations: [expressiveCode(), mdx(), react()],

    site: "https://favteo.com",
    markdown: {
        processor: unified({
            remarkPlugins: [remarkSectionize, remarkLastUpdatedTime],
        }),
    },
    image: {
        domains: ["svgl.app"],
        remotePatterns: [
            {
                protocol: "https",
            },
        ],
    },
});
