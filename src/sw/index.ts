import {NetworkFirst} from 'workbox-strategies';
import {precacheAndRoute} from 'workbox-precaching';
import {registerRoute} from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;
export {};

precacheAndRoute(self.__WB_MANIFEST)

addEventListener('install', async () => {
	// Whenever a new version is available, install it immediately
	await self.skipWaiting()
	await self.clients.claim()
})

registerRoute('/', new NetworkFirst())
