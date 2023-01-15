import {Workbox} from 'workbox-window';

interface ServiceWorkerMessage {
	message: string;
}

const wb = new Workbox('/sw.js')

const registerServiceWorker = async () => {
	const reg = await wb.register()
	await reg.update()
}

const sendMessageToServiceWorker = (message: ServiceWorkerMessage): Promise<unknown> => {
	return new Promise((resolve, reject) => {
		wb.messageSW(message).then((event: MessageEvent): void => {
			if (event.data) {
				if (event.data.error) {
					reject(event.data.error)
				} else {
					resolve(event.data)
				}
			}
		})
	})
}

export {
	sendMessageToServiceWorker,
	registerServiceWorker
}