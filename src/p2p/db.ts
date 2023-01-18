import {Chat, ChatItem, ChatMessage} from '../types'

const openDb = async (): Promise<IDBDatabase> => {
	return new Promise((accept, reject) => {
		const req = self.indexedDB.open('yasm', 4)

		req.addEventListener('success', () => {
			accept(req.result)
		})
		req.addEventListener('upgradeneeded', (ev) => {
			console.log('[DB]', `update from ${ev.oldVersion} to ${ev.newVersion}`)

			switch (ev.oldVersion) {
				case 0:
					req.result.createObjectStore('chats')
				// eslint-disable-next-line no-fallthrough
				case 1:
					req.result.createObjectStore('messages')
				// eslint-disable-next-line no-fallthrough
				case 4:
					req.result.createObjectStore('counters')
			}
		})
		req.addEventListener('error', () => {
			reject(req.error)
		})
	})
}

const resolveDbRequest = <T>(req: IDBRequest<T>): Promise<T> => {
	return new Promise((accept, reject) => {
		req.addEventListener('success', () => accept(req.result))
		req.addEventListener('error', () => reject(req.error))
	})
}

class Database {
	#db: IDBDatabase

	async #ensureDbReady() {
		if (this.#db)
			return

		this.#db = await openDb()
	}

	async getChatIds(): Promise<string[]> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('chats', 'readonly')
		return await resolveDbRequest(trans.objectStore('chats').getAllKeys()) as string[]
	}

	async getChats(): Promise<ChatItem[]> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('chats', 'readonly')
		return await resolveDbRequest(trans.objectStore('chats').getAll())
	}

	async hasChat(peer: string): Promise<boolean> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('chats', 'readonly')
		return await resolveDbRequest(trans.objectStore('chats').count(peer)) > 0
	}

	async getChat(peer: string): Promise<Chat> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction(['chats', 'messages'], 'readonly')
		const user = await resolveDbRequest(trans.objectStore('chats').get(peer))
		if (!user)
			return undefined

		const messages = await resolveDbRequest<ChatMessage[]>(trans.objectStore('messages').getAll(IDBKeyRange.bound(peer + '_0', peer + '_9')))

		return {
			peer,
			messages,
			username: user.username,
		}
	}

	async createChat(peer: string, username: string): Promise<void> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('chats', 'readwrite')
		await resolveDbRequest(trans.objectStore('chats').put({peer, username}, peer))
	}

	async storeMessage(peer: string, msg: Omit<ChatMessage, 'id'>): Promise<void> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction(['messages', 'counters'], 'readwrite')
		let counter = await resolveDbRequest<number>(trans.objectStore('counters').get(peer))
		if (typeof counter !== 'number') counter = 0

		await resolveDbRequest(trans.objectStore('messages').put(
			{...msg, id: counter},
			peer + '_' + counter.toString().padStart(10, '0')),
		)
		await resolveDbRequest(trans.objectStore('counters').put(counter + 1, peer))
	}
}

const db = new Database()
export default db