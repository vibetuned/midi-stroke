declare module 'verovio/wasm' {
    const createVerovioModule: () => Promise<any>;
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

    export class VerovioToolkit {
        constructor(module: any);
        setOptions(options: any): void;
        loadData(data: string): void;
        renderToSVG(page: number, options: any): string;
        renderToTimemap(options?: { includeMeasures?: boolean; includeRests?: boolean }): TimemapEvent[];
        getMIDIValuesForElement(xmlId: string): { time: number; pitch: number; duration: number };
        // add other methods as needed
    }
}
