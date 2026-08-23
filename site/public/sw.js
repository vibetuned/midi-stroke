// Kill-switch for the old app service worker. The trainer used to live at
// the domain root with a Workbox SW registered at scope "/"; the root now
// serves the docs site. Old clients fetch this file as the SW update, it
// installs, unregisters itself, and reloads open tabs — which then land on
// the docs (with a link to /app/, where the trainer now lives, same origin
// so stats and imported collections carry over).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => client.navigate(client.url));
    })());
});
