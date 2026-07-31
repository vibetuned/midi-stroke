import { useState, useEffect } from 'react';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

// One toolkit per mount, on purpose: Verovio's setOptions merges with the
// instance's current options, so consumers with different rendering options
// (score views vs. the scale-builder preview) must not share an instance.
export function useVerovio() {
    const [toolkit, setToolkit] = useState<VerovioToolkit | null>(null);
    const [verovioModule, setVerovioModule] = useState<unknown>(null);

    useEffect(() => {
        let mounted = true;

        async function loadVerovio() {
            try {
                const module = await createVerovioModule();
                if (!mounted) return;
                setVerovioModule(module);
                setToolkit(new VerovioToolkit(module));
                console.log('Verovio toolkit instantiated');
            } catch (error) {
                console.error('Failed to load Verovio:', error);
            }
        }

        loadVerovio();

        return () => {
            mounted = false;
        };
    }, []);

    return { toolkit, verovioModule };
}
