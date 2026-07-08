import express, { type Request, type Response, type NextFunction } from 'express';
import { ScoreStore } from './db.ts';

// instrument / category are folder-like slugs (e.g. "piano", "first_two_hand_exercises")
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/i;
// File names may contain spaces, unicode, dots, etc. — only path separators are forbidden.
const NAME_RE = /^[^/\\\0]+\.mei$/i;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Express 5 types params as string | string[] (repeatable params); these routes
// only ever bind single segments.
function keyParams(req: Request): { instrument: string; category: string; name: string } {
    return req.params as { instrument: string; category: string; name: string };
}

function validateKey(req: Request, res: Response, next: NextFunction) {
    const { instrument, category, name } = keyParams(req);
    if (!SLUG_RE.test(instrument)) {
        return res.status(400).json({ error: `Invalid instrument: ${instrument}` });
    }
    if (category !== undefined && !SLUG_RE.test(category)) {
        return res.status(400).json({ error: `Invalid category: ${category}` });
    }
    if (name !== undefined && !NAME_RE.test(name)) {
        return res.status(400).json({ error: 'Invalid file name: must end in .mei and contain no path separators' });
    }
    next();
}

export function createApp(store: ScoreStore): express.Express {
    const app = express();

    // The Vite app runs on another origin during development.
    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });

    app.get('/api/health', (_req, res) => {
        res.json({ status: 'ok' });
    });

    app.get('/api/instruments', (_req, res) => {
        res.json(store.listInstruments());
    });

    app.get('/api/:instrument/categories', validateKey, (req, res) => {
        res.json(store.listCategories(keyParams(req).instrument));
    });

    // File metadata (no content), optionally filtered: ?category=<category>
    app.get('/api/:instrument/files', validateKey, (req, res) => {
        const category = typeof req.query.category === 'string' ? req.query.category : undefined;
        if (category !== undefined && !SLUG_RE.test(category)) {
            return res.status(400).json({ error: `Invalid category: ${category}` });
        }
        res.json(store.listFiles(keyParams(req).instrument, category));
    });

    // Same shape as public/<instrument>_files.json, so the app can swap its
    // catalog fetch to this endpoint without any other change.
    app.get('/api/:instrument/manifest', validateKey, (req, res) => {
        const { instrument } = keyParams(req);
        const manifest = store
            .listFiles(instrument)
            .map(f => ({ path: `${instrument}/${f.category}`, name: f.name }));
        res.json(manifest);
    });

    app.get('/api/:instrument/files/:category/:name', validateKey, (req, res) => {
        const { instrument, category, name } = keyParams(req);
        const file = store.getFile(instrument, category, name);
        if (!file) {
            return res.status(404).json({ error: `Not found: ${instrument}/${category}/${name}` });
        }
        res.type('application/xml').send(file.content);
    });

    // Upload/replace: raw MEI XML as the request body.
    app.put(
        '/api/:instrument/files/:category/:name',
        validateKey,
        express.text({ type: () => true, limit: MAX_FILE_BYTES }),
        (req, res) => {
            const { instrument, category, name } = keyParams(req);
            const content = typeof req.body === 'string' ? req.body : '';
            if (content.trim().length === 0) {
                return res.status(400).json({ error: 'Empty body: send the MEI file content as the request body' });
            }
            if (!content.trimStart().startsWith('<')) {
                return res.status(400).json({ error: 'Body does not look like MEI/XML' });
            }
            const created = store.upsertFile(instrument, category, name, content);
            res.status(created ? 201 : 200).json({
                instrument,
                category,
                name,
                size: Buffer.byteLength(content, 'utf8'),
                created,
            });
        },
    );

    app.delete('/api/:instrument/files/:category/:name', validateKey, (req, res) => {
        const { instrument, category, name } = keyParams(req);
        if (!store.deleteFile(instrument, category, name)) {
            return res.status(404).json({ error: `Not found: ${instrument}/${category}/${name}` });
        }
        res.sendStatus(204);
    });

    // Express recognizes error middleware by the 4-arg signature, so `_next` must stay.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
        const status = err.status ?? 500;
        if (status >= 500) console.error(err);
        res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
    });

    return app;
}
