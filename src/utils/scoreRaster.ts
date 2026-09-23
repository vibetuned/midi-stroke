import * as PIXI from 'pixi.js';

/**
 * Turning a Verovio SVG page into the Pixi sprites the score viewers scroll,
 * and Learn by ear's empty-bars version of the same page. Shared by the piano
 * and saxo viewers.
 */

/** Width of each rasterised slice of the score, in SVG pixels. */
export const TEXTURE_WIDTH = 2048;

/** Where a page sits in the scroll container, and at what resolution. */
export interface ScorePage {
    top: number;
    height: number;
    width: number;
    res: number;
}

/**
 * Learn by ear's empty bars: the same page with the music taken out. Staff
 * lines, barlines, the brace, clefs, key and time signatures and bar numbers
 * stay, so the bars still to come sit exactly where the real ones are. Hidden:
 * everything in a layer (notes, rests, beams — but not a clef change), ledger
 * lines, and every measure- or system-level event (slurs, ties, fingering,
 * dynamics, hairpins...). `visibility` is inherited but can be turned back on
 * by a descendant, which is what lets a layer's clef survive.
 */
const EMPTY_BARS_CSS = `
.layer, .staff > .ledgerLines,
.measure > :not(.staff):not(.barLine):not(.mNum),
.system > g:not(.measure):not(.section):not(.ending):not(.label):not(.labelAbbr):not(.systemMilestone):not(.systemMilestoneEnd) { visibility: hidden; }
.layer .clef, .layer .keySig, .layer .meterSig { visibility: visible; }`;

export function emptyBarsSvg(svg: string): string {
    const open = svg.indexOf('<svg');
    const end = open < 0 ? -1 : svg.indexOf('>', open);
    if (end < 0) return svg;
    return `${svg.slice(0, end + 1)}<style>${EMPTY_BARS_CSS}</style>${svg.slice(end + 1)}`;
}

export async function loadSvgImage(svg: string): Promise<HTMLImageElement> {
    const img = new Image();
    await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    });
    return img;
}

/** Rasterise the page into TEXTURE_WIDTH-wide sprites at device resolution
 *  (SVG images draw vector-sharp at any destination size, so slicing at dpr
 *  keeps the staff crisp on retina instead of GPU-upscaling 1× textures).
 *  `background` makes the slices opaque. */
export function sliceToSprites(img: HTMLImageElement, page: ScorePage, background?: string): PIXI.Sprite[] {
    const { top, height, width, res } = page;
    const sprites: PIXI.Sprite[] = [];
    for (let x = 0; x < width; x += TEXTURE_WIDTH) {
        const sliceW = Math.min(TEXTURE_WIDTH, width - x);
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(sliceW * res);
        canvas.height = Math.ceil(height * res);
        const ctx = canvas.getContext('2d');
        if (ctx) {
            if (background) {
                ctx.fillStyle = background;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, x, 0, sliceW, height, 0, 0, sliceW * res, height * res);
        }
        const sprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
        sprite.scale.set(1 / res);
        sprite.x = x;
        sprite.y = top;
        sprites.push(sprite);
    }
    return sprites;
}

/** Each note's left edge on the rendered page, by Verovio id. A chord is
 *  measured as a whole, so its accidentals count as part of every note. */
export function measureNoteLefts(hiddenDiv: HTMLElement, svgLeft: number): Map<string, number> {
    const noteLeft = new Map<string, number>();
    hiddenDiv.querySelectorAll('.note').forEach(el => {
        const box = (el.closest('.chord') ?? el).getBoundingClientRect();
        if (el.id) noteLeft.set(el.id, box.left - svgLeft);
    });
    return noteLeft;
}

/** Where each staff's five lines sit on the page, top line to bottom line,
 *  measured on the first measure (every measure of the one system shares
 *  them). Top to bottom. */
export function measureStaffLines(hiddenDiv: HTMLElement, svgTop: number): Array<{ top: number; bottom: number }> {
    const firstMeasure = hiddenDiv.querySelector('.system .measure');
    if (!firstMeasure) return [];
    const staves: Array<{ top: number; bottom: number }> = [];
    firstMeasure.querySelectorAll(':scope > .staff').forEach(staff => {
        let top = Infinity, bottom = -Infinity;
        // The lines are the staff's own paths; notes and clefs are in groups.
        staff.querySelectorAll(':scope > path').forEach(line => {
            const r = line.getBoundingClientRect();
            top = Math.min(top, r.top - svgTop);
            bottom = Math.max(bottom, r.bottom - svgTop);
        });
        if (isFinite(top) && bottom > top) staves.push({ top, bottom });
    });
    return staves.sort((a, b) => a.top - b.top);
}
