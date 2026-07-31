import { existsSync, readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { openDb, ScoreStore } from './db.ts';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

// Reuse the app's mkcert certificates (the same ones vite.config.ts picks up)
// so the HTTPS-served app can call this server from other devices without the
// browser blocking it as mixed content. Set SSL_CERT/SSL_KEY to override.
const certsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'certs');
const certPath = process.env.SSL_CERT ?? join(certsDir, 'localhost+2.pem');
const keyPath = process.env.SSL_KEY ?? join(certsDir, 'localhost+2-key.pem');
const useHttps = existsSync(certPath) && existsSync(keyPath);

const db = openDb();
const app = createApp(new ScoreStore(db));

const server = useHttps
    ? createHttpsServer({ cert: readFileSync(certPath), key: readFileSync(keyPath) }, app)
    : createHttpServer(app);

server.listen(port, host, () => {
    const proto = useHttps ? 'https' : 'http';
    const hosts = host === '0.0.0.0' || host === '::'
        ? ['localhost', ...Object.values(networkInterfaces())
            .flatMap(infos => infos ?? [])
            .filter(info => info.family === 'IPv4' && !info.internal)
            .map(info => info.address)]
        : [host];
    console.log('MEI score server listening on:');
    for (const h of hosts) {
        console.log(`  ${proto}://${h}:${port}`);
    }
});
