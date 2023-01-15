export const openDb = async (): Promise<IDBDatabase> => {
	return new Promise((accept, reject) => {
		const req = self.indexedDB.open('yasm', 2)

		req.addEventListener('success', () => {
			accept(req.result)
		})
		req.addEventListener('upgradeneeded', (ev) => {
			switch (ev.oldVersion) {
				case 0:
					req.result.createObjectStore('chats')
				// eslint-disable-next-line no-fallthrough
				case 1:
					req.result.createObjectStore('messages')
			}
		})
		req.addEventListener('error', () => {
			reject(req.error)
		})
	})
}

export const resolveDbRequest = <T>(req: IDBRequest<T>): Promise<T> => {
	return new Promise((accept, reject) => {
		req.addEventListener('success', () => accept(req.result))
		req.addEventListener('error', () => reject(req.error))
	})
}