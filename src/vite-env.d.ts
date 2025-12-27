declare module 'verovio/wasm' {
    const createVerovioModule: () => Promise<any>;
    export default createVerovioModule;
}

declare module 'verovio/esm' {
    export class VerovioToolkit {
        constructor(module: any);
        setOptions(options: any): void;
        loadData(data: string): void;
        renderToSVG(page: number, options: any): string;
        // add other methods as needed
    }
}
