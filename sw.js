// Minimální service worker (jen kvůli instalaci aplikace). Nic nekešuje, vždy bere aktuální verzi ze sítě.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',()=>{});
