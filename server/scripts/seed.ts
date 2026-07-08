/**
 * Imports every MEI file listed in the app's public catalogs
 * (public/<instrument>_files.json) into the SQLite database.
 * Idempotent: re-running updates existing rows in place.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, ScoreStore } from '../src/db.ts';

interface CatalogEntry {
    path: string; // "<instrument>/<category>"
    name: string;
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const store = new ScoreStore(openDb());

const catalogs = readdirSync(publicDir).filter(f => /^[a-z0-9_-]+_files\.json$/.test(f));
if (catalogs.length === 0) {
    console.error(`No *_files.json catalogs found in ${publicDir}`);
    process.exit(1);
}

let created = 0;
let updated = 0;
let missing = 0;

for (const catalog of catalogs) {
    const instrument = catalog.replace(/_files\.json$/, '');
    const entries: CatalogEntry[] = JSON.parse(readFileSync(join(publicDir, catalog), 'utf8'));
    console.log(`${catalog}: ${entries.length} entries`);

    for (const entry of entries) {
        const category = entry.path.startsWith(`${instrument}/`)
            ? entry.path.slice(instrument.length + 1)
            : entry.path;
        let content: string;
        try {
            content = readFileSync(join(publicDir, entry.path, entry.name), 'utf8');
        } catch {
            console.warn(`  missing on disk, skipped: ${entry.path}/${entry.name}`);
            missing++;
            continue;
        }
        if (store.upsertFile(instrument, category, entry.name, content)) {
            created++;
        } else {
            updated++;
        }
    }
}

console.log(`Done: ${created} created, ${updated} updated, ${missing} missing.`);
