import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import UnoCSS from "@unocss/astro";
import icon from "astro-icon";

import solidJs from "@astrojs/solid-js";
import { unified } from "@astrojs/markdown-remark";
import { remarkReadingTime } from "./src/lib/remark-reading-time.mjs";

// https://astro.build/config
export default defineConfig({
  site: "https://gknob.ca/",
  integrations: [
    sitemap(),
    solidJs(),
    UnoCSS({ injectReset: true }),
    icon(),
  ],
  markdown: {
    processor: unified({ remarkPlugins: [remarkReadingTime] }),
  },
  output: "static",
});
