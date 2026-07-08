import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DB_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'scores.db');

export interface FileMeta {
    instrument: string;
    category: string;
    name: string;
    size: number;
    created_at: string;
    updated_at: string;
}

export interface FileRow extends FileMeta {
    content: string;
}

export function openDb(dbPath: string = process.env.DB_PATH ?? DEFAULT_DB_PATH): DatabaseSync {
    if (dbPath !== ':memory:') {
        mkdirSync(dirname(dbPath), { recursive: true });
    }
    const db = new DatabaseSync(dbPath);
    db.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS files (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            instrument TEXT NOT NULL,
            category   TEXT NOT NULL,
            name       TEXT NOT NULL,
            content    TEXT NOT NULL,
            size       INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (instrument, category, name)
        );
        CREATE INDEX IF NOT EXISTS idx_files_instrument_category
            ON files (instrument, category);
    `);
    return db;
}

export class ScoreStore {
    private db: DatabaseSync;

    constructor(db: DatabaseSync) {
        this.db = db;
    }

    listInstruments(): string[] {
        return this.db
            .prepare('SELECT DISTINCT instrument FROM files ORDER BY instrument')
            .all()
            .map(r => String((r as { instrument: unknown }).instrument));
    }

    listCategories(instrument: string): string[] {
        return this.db
            .prepare('SELECT DISTINCT category FROM files WHERE instrument = ? ORDER BY category')
            .all(instrument)
            .map(r => String((r as { category: unknown }).category));
    }

    listFiles(instrument: string, category?: string): FileMeta[] {
        const sql =
            'SELECT instrument, category, name, size, created_at, updated_at FROM files WHERE instrument = ?' +
            (category ? ' AND category = ?' : '') +
            ' ORDER BY category, name';
        const args = category ? [instrument, category] : [instrument];
        return this.db.prepare(sql).all(...args) as unknown as FileMeta[];
    }

    getFile(instrument: string, category: string, name: string): FileRow | undefined {
        return this.db
            .prepare(
                'SELECT instrument, category, name, content, size, created_at, updated_at FROM files WHERE instrument = ? AND category = ? AND name = ?',
            )
            .get(instrument, category, name) as unknown as FileRow | undefined;
    }

    /** Insert or replace a file. Returns true if the file was newly created. */
    upsertFile(instrument: string, category: string, name: string, content: string): boolean {
        const now = new Date().toISOString();
        const existed =
            this.db
                .prepare('SELECT 1 FROM files WHERE instrument = ? AND category = ? AND name = ?')
                .get(instrument, category, name) !== undefined;
        this.db
            .prepare(
                `INSERT INTO files (instrument, category, name, content, size, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (instrument, category, name)
                 DO UPDATE SET content = excluded.content, size = excluded.size, updated_at = excluded.updated_at`,
            )
            .run(instrument, category, name, content, Buffer.byteLength(content, 'utf8'), now, now);
        return !existed;
    }

    /** Returns true if a file was deleted. */
    deleteFile(instrument: string, category: string, name: string): boolean {
        const result = this.db
            .prepare('DELETE FROM files WHERE instrument = ? AND category = ? AND name = ?')
            .run(instrument, category, name);
        return result.changes > 0;
    }
}
