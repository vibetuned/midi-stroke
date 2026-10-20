import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { openExternal } from '../utils/platform';
import { cardIconStyle, cardStyle, cardTitleStyle, closeStyle } from './dialogStyles';

/**
 * About Midi Stroke: what it is, where its source is, and the licences of
 * what it is made with — the notices the app's licence (AGPL-3.0), Verovio's
 * (LGPL-3.0) and the bundled packages' ask to travel with it, in the desktop
 * and mobile apps as on the web. The full list of packages and their licence
 * texts (public/licenses.json, scripts/build-licenses.mjs) loads only when
 * opened; the GNU licences are in public/licenses/.
 */

const REPO = 'https://github.com/vibetuned/midi-stroke';

interface LicenceGroup {
    license: string;
    text: string | null;
    packages: Array<{ name: string; version: string; url: string; ecosystem: 'npm' | 'crates' }>;
}

export const AboutButton: React.FC = () => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="splash-about"
                title="About Midi Stroke, its source and its licences"
            >
                ⓘ About &amp; licences
            </button>
            {open && createPortal(<AboutDialog onClose={() => setOpen(false)} />, document.body)}
        </>
    );
};

const AboutDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    // One page at a time: the notices, a GNU licence's text, or the packages.
    const [page, setPage] = useState<{ kind: 'about' } | { kind: 'text'; title: string; file: string } | { kind: 'packages' }>({ kind: 'about' });

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (page.kind === 'about') onClose(); else setPage({ kind: 'about' });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, page.kind]);

    const text = (title: string, file: string) => setPage({ kind: 'text', title, file });

    return (
        <div
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.75rem',
            }}
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-label="About Midi Stroke"
                style={{
                    background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', boxSizing: 'border-box',
                    padding: '1.25rem 1.4rem', width: '100%', maxWidth: '640px', maxHeight: '100%', overflowY: 'auto',
                    color: 'white', display: 'flex', flexDirection: 'column', gap: '0.8rem',
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', minWidth: 0 }}>
                        {page.kind !== 'about' && (
                            <button onClick={() => setPage({ kind: 'about' })} title="Back" style={{ ...closeStyle, alignSelf: 'center' }}>←</button>
                        )}
                        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
                            {page.kind === 'about' ? 'Midi Stroke' : page.kind === 'text' ? page.title : 'Open-source components'}
                        </h2>
                        {page.kind === 'about' && <span style={{ fontSize: '0.8rem', color: '#9a9aa8' }}>version {__APP_VERSION__}</span>}
                    </div>
                    <button onClick={onClose} title="Close (Esc)" style={closeStyle}>✕</button>
                </div>

                {page.kind === 'about' && <About onText={text} onPackages={() => setPage({ kind: 'packages' })} />}
                {page.kind === 'text' && <LicenceText file={page.file} />}
                {page.kind === 'packages' && <Packages />}
            </div>
        </div>
    );
};

const About: React.FC<{ onText: (title: string, file: string) => void; onPackages: () => void }> = ({ onText, onPackages }) => (
    <>
        <p style={{ margin: 0, fontSize: '0.88rem', color: '#c8c8d2', lineHeight: 1.5 }}>
            A free music trainer for piano, drums and saxophone, made in the open by Vibetuned,
            a non-profit for music and arts education.
        </p>

        <Notice icon="📖" title="Free software">
            Midi Stroke is free software: you can redistribute and modify it under the GNU Affero
            General Public License, version 3 or later. Its complete source code is published.
            <Links>
                <Link onClick={() => openExternal(`${REPO}/tree/v${__APP_VERSION__}`)}>Source of this version</Link>
                <Link onClick={() => onText('GNU AGPL v3', 'AGPL-3.0.txt')}>Licence</Link>
            </Links>
        </Notice>

        <Notice icon="🎼" title="Music engraving by Verovio">
            Scores are engraved by Verovio, © RISM Digital Center and the Verovio contributors, used
            unmodified under the GNU Lesser General Public License, version 3 or later, which builds
            on the GNU General Public License, version 3.
            <Links>
                <Link onClick={() => openExternal('https://www.verovio.org')}>verovio.org</Link>
                <Link onClick={() => openExternal('https://github.com/rism-digital/verovio')}>Verovio's source</Link>
                <Link onClick={() => onText('GNU LGPL v3', 'LGPL-3.0.txt')}>LGPL v3</Link>
                <Link onClick={() => onText('GNU GPL v3', 'GPL-3.0.txt')}>GPL v3</Link>
            </Links>
        </Notice>

        <Notice icon="🎧" title="Sounds and data">
            <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <li>Piano: the <i>Salamander Grand Piano</i> by Alexander Holm, CC BY 3.0.</li>
                <li>Grooves: the <i>Groove MIDI Dataset</i>, Magenta (Google), CC BY 4.0 — put on a grid and written out as scores by the app.</li>
                <li>Jazz licks: patterns of the <i>Weimar Jazz Database</i> and the Pattern History Explorer, The Jazzomat Research Project, ODbL 1.0.</li>
                <li>Game sounds: NASA/JPL-Caltech recordings, and sample libraries credited with the sounds.</li>
            </ul>
            <Links>
                <Link onClick={() => openExternal(`${REPO}/blob/main/public/groove/CREDITS.md`)}>Grooves</Link>
                <Link onClick={() => openExternal(`${REPO}/blob/main/public/jazz/CREDITS.md`)}>Jazz licks</Link>
                <Link onClick={() => openExternal(`${REPO}/blob/main/public/games/sounds/CREDITS.md`)}>Game sounds</Link>
            </Links>
        </Notice>

        <Notice icon="🧩" title="Open-source components">
            Built with React, Tone.js, PixiJS, Tauri and the packages they use, each under its own licence.
            <Links>
                <Link onClick={onPackages}>All components and their licences</Link>
            </Links>
        </Notice>

        <p style={{ margin: 0, fontSize: '0.75rem', color: '#7a7a88' }}>
            No personal data is collected: everything stays on your device.{' '}
            <Link onClick={() => openExternal('https://ms.vibetuned.com/privacy/')}>Privacy</Link>
            {' · '}Made something here, and want it credited differently or removed? Write to dev@vibetuned.com.
        </p>
    </>
);

const Notice: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <section style={{ ...cardStyle(false), alignItems: 'flex-start' }}>
        <span style={cardIconStyle} aria-hidden="true">{icon}</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: '#c8c8d2', lineHeight: 1.45 }}>
            <span style={cardTitleStyle}>{title}</span>
            {children}
        </div>
    </section>
);

const Links: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.9rem', marginTop: '0.15rem' }}>{children}</span>
);

const Link: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    <button
        onClick={onClick}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-accent)', textDecoration: 'underline', font: 'inherit', fontSize: '0.8rem' }}
    >
        {children}
    </button>
);

/** A licence's full text, as the app carries it (public/licenses/). */
const LicenceText: React.FC<{ file: string }> = ({ file }) => {
    const [text, setText] = useState<string | null>(null);
    useEffect(() => {
        fetch(`${import.meta.env.BASE_URL}licenses/${file}`).then(r => r.text()).then(setText).catch(() => setText('Could not load the licence.'));
    }, [file]);
    return <pre style={preStyle}>{text ?? 'Loading…'}</pre>;
};

/** Every package the app is built from, its licence, and the licence's text. */
const Packages: React.FC = () => {
    const [groups, setGroups] = useState<LicenceGroup[] | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        fetch(`${import.meta.env.BASE_URL}licenses.json`)
            .then(r => r.json())
            .then((d: { groups: LicenceGroup[] }) => setGroups(d.groups))
            .catch(() => setFailed(true));
    }, []);
    if (failed) return <p style={{ margin: 0, color: '#9a9aa8' }}>The list is made when the app is built (npm run build:licenses).</p>;
    if (!groups) return <p style={{ margin: 0, color: '#9a9aa8' }}>Loading…</p>;
    const count = groups.reduce((n, g) => n + g.packages.length, 0);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#9a9aa8' }}>{count} packages. Tap one to read its licence.</p>
            {groups.map((g, k) => (
                <details key={k} style={{ ...cardStyle(false), display: 'block', padding: '0.55rem 0.8rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>
                        <span style={{ fontWeight: 600 }}>{g.packages.map(p => p.name).join(', ')}</span>
                        <span style={{ color: '#9a9aa8' }}> — {g.license}</span>
                    </summary>
                    <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#9a9aa8' }}>
                        {g.packages.map(p => `${p.name} ${p.version}`).join(' · ')}
                    </div>
                    <pre style={{ ...preStyle, maxHeight: '18rem', marginTop: '0.4rem' }}>{g.text ?? `${g.license} — see the package's source for its notice.`}</pre>
                </details>
            ))}
        </div>
    );
};

const preStyle: React.CSSProperties = {
    margin: 0, padding: '0.7rem 0.8rem', borderRadius: '8px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.7rem', lineHeight: 1.45, color: '#c8c8d2',
    whiteSpace: 'pre-wrap', overflowY: 'auto', maxHeight: '60vh',
};
