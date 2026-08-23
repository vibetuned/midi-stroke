// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

/**
 * The Midi Stroke user guide.
 *
 * Deployed by .github/workflows/deploy.yml to https://ms.vibetuned.com — the
 * site owns the domain root and the app is deployed next to it under /app/.
 * Screenshots are copied from ../docs/screenshots by the `assets` script so
 * the README and the site share one set.
 */
export default defineConfig({
  site: "https://ms.vibetuned.com",
  integrations: [
    starlight({
      title: "Midi Stroke",
      description:
        "User guide for Midi Stroke — a MIDI training suite for piano, finger drums, wind-controller saxophone and music theory, with real engraved scores.",
      logo: { src: "./src/assets/logo.svg", alt: "Midi Stroke" },
      favicon: "/favicon.svg",
      head: [
        { tag: "meta", attrs: { name: "theme-color", content: "#121214" } },
      ],
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/vibetuned/midi-stroke" },
      ],
      editLink: { baseUrl: "https://github.com/vibetuned/midi-stroke/edit/main/site/" },
      lastUpdated: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Start here",
          items: [
            { slug: "getting-started" },
            { slug: "songs" },
          ],
        },
        {
          label: "Instruments",
          items: [
            { slug: "instruments/piano" },
            { slug: "instruments/drums" },
            { slug: "instruments/saxo" },
            { slug: "instruments/theory" },
          ],
        },
        {
          label: "More",
          items: [
            { slug: "desktop" },
            { slug: "development" },
          ],
        },
      ],
    }),
  ],
});
