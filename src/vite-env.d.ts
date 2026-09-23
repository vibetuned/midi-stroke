declare module 'verovio/wasm' {
    /** The compiled Verovio module, handed straight to the toolkit. */
    export type VerovioModule = object;
    const createVerovioModule: () => Promise<VerovioModule>;
    export default createVerovioModule;
}

declare module 'verovio/esm' {
    /** One timemap entry: what turns on/off at a musical moment. */
    export interface TimemapEvent {
        /** Real-time milliseconds at the score's notated tempo (unused — tempo-dependent). */
        tstamp: number;
        /** Musical time in quarter notes from the start. */
        qstamp: number;
        on?: string[];
        off?: string[];
        restsOn?: string[];
        restsOff?: string[];
        /** Measure element id (matches the SVG g.measure id). */
        measureOn?: string;
    }

    /** Verovio's options (verovio.org/docs): names and values as it takes them. */
    export type VerovioOptions = Record<string, string | number | boolean>;

    export class VerovioToolkit {
        constructor(module: import('verovio/wasm').VerovioModule);
        setOptions(options: VerovioOptions): void;
        loadData(data: string): void;
        renderToSVG(page: number, options?: VerovioOptions): string;
        renderToTimemap(options?: { includeMeasures?: boolean; includeRests?: boolean }): TimemapEvent[];
        getMIDIValuesForElement(xmlId: string): { time: number; pitch: number; duration: number };
        // add other methods as needed
    }
}
