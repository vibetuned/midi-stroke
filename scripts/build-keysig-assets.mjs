/**
 * Offline pipeline: engrave the 13 possible key signatures (fifths -6..+6,
 * treble clef) with Verovio and bake them into src/assets/keySignatures.ts,
 * so the circle-of-fifths hub needs no runtime toolkit at all. This keeps
 * the wheel free of Verovio state (a hub render used to set options on a
 * live toolkit) and of the toolkit-as-prop pattern.
 *
 * Usage:  node scripts/build-keysig-assets.mjs
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'assets', 'keySignatures.ts');

/** Minimal MusicXML whose render is just a clef + key signature. */
function keySignatureXml(fifths) {
    return `<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name/></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>${fifths}</fifths></key><clef><sign>G</sign><line>2</line></clef></attributes>
      <note print-object="no"><rest measure="yes"/><duration>16</duration></note>
    </measure>
  </part>
</score-partwise>`;
}

const module = await createVerovioModule();
const toolkit = new VerovioToolkit(module);
toolkit.setOptions({
    breaks: 'none', adjustPageWidth: true, adjustPageHeight: true,
    svgViewBox: true, header: 'none', footer: 'none', scale: 100,
    measureMinWidth: 1,
    pageMarginLeft: 0, pageMarginRight: 0, pageMarginTop: 0, pageMarginBottom: 0,
});

const entries = [];
for (let fifths = -6; fifths <= 6; fifths++) {
    toolkit.loadData(keySignatureXml(fifths));
    // Position/size for embedding in the wheel hub (220-unit viewBox).
    const svg = toolkit.renderToSVG(1, {})
        .replace('<svg ', '<svg x="-27" y="-19" width="54" height="28" ')
        .replace(/\n\s*/g, ' ');
    entries.push(`    '${fifths}': ${JSON.stringify(svg)},`);
    console.log(`fifths=${fifths}: ${svg.length} bytes`);
}

writeFileSync(OUT, `/**
 * GENERATED FILE — do not edit by hand.
 * Rebuild with:  node scripts/build-keysig-assets.mjs
 *
 * Treble-clef key signatures (fifths -6..+6) engraved by Verovio, sized for
 * the circle-of-fifths hub (x/y/width/height set for its 220-unit viewBox).
 */
export const KEY_SIGNATURE_SVGS: Record<string, string> = {
${entries.join('\n')}
};
`);
console.log(`wrote ${OUT}`);
