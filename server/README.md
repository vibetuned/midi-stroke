# MEI Score Server

Small Node server that stores and serves MEI score files (like the ones in `public/`)
from a SQLite database, organized by **instrument** and **category**.

No build step and no native modules: it runs TypeScript directly on Node ≥ 24 and uses
the built-in `node:sqlite` driver. The only runtime dependency is Express.

## Setup

```sh
cd server
npm install
npm run seed   # import everything listed in public/*_files.json into SQLite
npm run dev    # start with auto-reload on http://localhost:3001
```

`npm start` runs it without the file watcher, and `npm run clean` erases all data
(deletes the `data/` directory holding the SQLite database).

Environment variables:

| Variable  | Default          | Purpose                    |
| --------- | ---------------- | -------------------------- |
| `PORT`    | `3001`           | HTTP port                  |
| `DB_PATH` | `data/scores.db` | SQLite database file       |

## API

All responses are JSON except the raw MEI download.

| Method   | Route                                        | Description                                             |
| -------- | -------------------------------------------- | ------------------------------------------------------- |
| `GET`    | `/api/health`                                | Liveness check                                          |
| `GET`    | `/api/instruments`                           | Instruments present in the database                     |
| `GET`    | `/api/:instrument/categories`                | Categories for one instrument                           |
| `GET`    | `/api/:instrument/files[?category=…]`        | File metadata (name, size, timestamps), no content      |
| `GET`    | `/api/:instrument/manifest`                  | Catalog in the exact shape of `public/<instrument>_files.json` |
| `GET`    | `/api/:instrument/files/:category/:name`     | Download the MEI file (`application/xml`)               |
| `PUT`    | `/api/:instrument/files/:category/:name`     | Create or replace; raw MEI XML as the request body      |
| `DELETE` | `/api/:instrument/files/:category/:name`     | Delete one file                                         |

`PUT` answers `201` when the file is new and `200` when it replaced an existing one.

### Examples

```sh
# Upload (create or replace)
curl -X PUT --data-binary @score.mei -H 'Content-Type: application/xml' \
  'http://localhost:3001/api/piano/files/my_exercises/score.mei'

# List piano categories, then the files of one category
curl 'http://localhost:3001/api/piano/categories'
curl 'http://localhost:3001/api/piano/files?category=my_exercises'

# Download / delete
curl 'http://localhost:3001/api/piano/files/my_exercises/score.mei'
curl -X DELETE 'http://localhost:3001/api/piano/files/my_exercises/score.mei'
```

From the app, uploading a local file is just:

```ts
await fetch(`/api/${instrument}/files/${category}/${encodeURIComponent(file.name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/xml' },
    body: file,
});
```

## Wiring the app to it

CORS is open, so the Vite dev app can call `http://localhost:3001` directly.
Alternatively, proxy `/api` in `vite.config.ts` and keep same-origin URLs:

```ts
server: {
    proxy: { '/api': 'http://localhost:3001' },
}
```

The catalog fetch in `SongSelector`/`SongNavigator` (`/${instrument}_files.json`) can then
switch to `/api/${instrument}/manifest`, and the score fetch to
`/api/${instrument}/files/${category}/${name}` — the manifest already returns
`{ path, name }` entries compatible with the existing code.
