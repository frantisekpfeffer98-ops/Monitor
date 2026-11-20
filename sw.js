// Minimální service worker (jen kvůli instalaci aplikace na plochu). Nic nekešuje,
// aplikace se vždy načítá aktuální ze sítě. Prázdný handler 'fetch' tu záměrně není –
// prohlížeče ho už pro instalaci nevyžadují a hlásí ho jako zbytečný.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
