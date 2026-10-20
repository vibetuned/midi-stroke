/**
 * The open-source licences of everything the app is built from, for the
 * About screen (src/components/AboutDialog.tsx): the JavaScript packages the
 * web app bundles (npm production dependencies) and the Rust crates the
 * desktop and mobile shells are compiled from (src-tauri, every platform).
 * Each with its licence's own text — the copyright notices MIT, BSD and the
 * like ask to be shipped with the app — identical texts grouped once.
 *
 * Writes public/licenses.json, which the app fetches only when it is opened.
 * Without cargo (the web deploy has no Rust), the crates are left out: the
 * web app ships none of them.
 *
 *   node scripts/build-licenses.mjs        (run by npm run build)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\b|[-_.].*)?$/i;

/** The licence texts in a package's folder: LICENSE, LICENSE-MIT, COPYING, NOTICE… */
function licenceTexts(dir) {
    if (!dir || !existsSync(dir)) return [];
    return readdirSync(dir)
        .filter(f => LICENSE_FILE.test(f))
        .sort()
        .map(f => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim())
        .filter(Boolean);
}

const url = repo => {
    const raw = typeof repo === 'string' ? repo : repo?.url;
    if (!raw) return null;
    return raw.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://').replace(/^github:/, 'https://github.com/');
};

// ------------------------------------------------------------ npm
const packages = [];
{
    const tree = JSON.parse(execFileSync('npm', ['ls', '--omit=dev', '--all', '--json', '--long'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString());
    const seen = new Set();
    const walk = deps => {
        for (const [name, d] of Object.entries(deps ?? {})) {
            const key = `${name}@${d.version}`;
            if (!d.version || seen.has(key)) continue;
            seen.add(key);
            const dir = d.path ?? join(ROOT, 'node_modules', name);
            let pkg = {};
            try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { /* none */ }
            packages.push({
                ecosystem: 'npm', name, version: d.version,
                license: typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? (pkg.licenses?.map?.(l => l.type).join(' OR ') || 'UNKNOWN'),
                url: url(pkg.repository) ?? pkg.homepage ?? `https://www.npmjs.com/package/${name}`,
                texts: licenceTexts(dir),
            });
            walk(d.dependencies);
        }
    };
    walk(tree.dependencies);
}

// ------------------------------------------------------------ cargo
let crates = 0;
try {
    const meta = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--manifest-path', join(ROOT, 'src-tauri', 'Cargo.toml')], { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
    const own = new Set(meta.workspace_members);
    for (const p of meta.packages) {
        if (own.has(p.id) || p.source === null) continue;   // the shell and its own plugin: the app's licence
        const dir = dirname(p.manifest_path);
        const texts = licenceTexts(dir);
        if (p.license_file && existsSync(join(dir, p.license_file)) && !texts.length) texts.push(readFileSync(join(dir, p.license_file), 'utf8').trim());
        packages.push({
            ecosystem: 'crates', name: p.name, version: p.version,
            license: p.license ?? 'UNKNOWN',
            url: p.repository ?? p.homepage ?? `https://crates.io/crates/${p.name}`,
            texts,
        });
        crates++;
    }
} catch {
    console.log('  (no cargo: Rust crates left out)');
}

// ------------------------------------------------------------ grouped by text
const groups = new Map();
for (const p of packages) {
    const text = p.texts.join('\n\n────────\n\n');
    const key = createHash('sha1').update(`${p.license}\n${text}`).digest('hex');
    if (!groups.has(key)) groups.set(key, { license: p.license, text: text || null, packages: [] });
    groups.get(key).packages.push({ name: p.name, version: p.version, url: p.url, ecosystem: p.ecosystem });
}
const out = {
    generated: new Date().toISOString().slice(0, 10),
    count: packages.length,
    groups: [...groups.values()].sort((a, b) => a.packages[0].name.localeCompare(b.packages[0].name)),
};
writeFileSync(join(ROOT, 'public', 'licenses.json'), JSON.stringify(out));
const missing = packages.filter(p => !p.texts.length).length;
console.log(`✓ licenses.json: ${packages.length} packages (${packages.length - crates} npm, ${crates} crates), ${out.groups.length} texts${missing ? `, ${missing} without a licence file (named by their licence)` : ''}`);
