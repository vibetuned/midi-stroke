import { useState, useEffect } from 'react';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

export function useVerovio() {
    const [toolkit, setToolkit] = useState<VerovioToolkit | null>(null);
    const [verovioModule, setVerovioModule] = useState<any>(null);

    useEffect(() => {
        let mounted = true;

        async function loadVerovio() {
            if (!mounted) return;
            try {
                const module = await createVerovioModule();
                console.log("Verovio Module Loaded:", module);

                const tk = new VerovioToolkit(module);

                if (mounted) {
                    setVerovioModule(module);
                    setToolkit(tk);
                    console.log('Verovio toolkit instantiated');
                }
            } catch (error) {
                console.error('Failed to load Verovio:', error);
            }
        }

        if (!toolkit) {
            loadVerovio();
        }

        return () => {
            mounted = false;
            // Cleanup if necessary
        };
    }, [toolkit]);

    return { toolkit, verovioModule };
}
