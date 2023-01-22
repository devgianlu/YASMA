import {Chat, ChatItem, ChatMessage} from '../types'

const openDb = async (): Promise<IDBDatabase> => {
	return new Promise((accept, reject) => {
		const req = self.indexedDB.open('yasm', 1)

		req.addEventListener('success', () => {
			accept(req.result)
		})
		req.addEventListener('upgradeneeded', (ev) => {
			console.log('[DB]', `update from ${ev.oldVersion} to ${ev.newVersion}`)

			switch (ev.oldVersion) {
				case 0:
					req.result.createObjectStore('chats')
					req.result.createObjectStore('messages')
					req.result.createObjectStore('counters')
					req.result.createObjectStore('unsentMessages')
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

const iterateCursor = async function* (req: IDBRequest<IDBCursorWithValue>): AsyncGenerator<IDBCursorWithValue> {
	while (true) {
		const cursor = await resolveDbRequest<IDBCursorWithValue | null>(req)
		if (!cursor)
			break

		yield cursor
		cursor.continue()
	}
}

const iterateCursorValue = async function* <T>(req: IDBRequest<IDBCursorWithValue>): AsyncGenerator<T> {
	while (true) {
		const cursor = await resolveDbRequest<IDBCursorWithValue | null>(req)
		if (!cursor)
			break

		yield cursor.value
		cursor.continue()
	}
}

const messageIdToDatabaseKey = (peer: string, msgId: number): IDBValidKey => {
	return peer + '_' + msgId.toString().padStart(10, '0')
}

export type ChatsEvent = {
	type: 'chats'
}
export type ChatEvent = {
	type: 'chat'
	peer: string
}
export type MessageEvent = {
	type: 'message'
	peer: string
}
type Event = ChatsEvent | ChatEvent | MessageEvent

type Listener<Type extends Event['type']> = (data: Readonly<Event & { type: Type }>) => void

class Database {
	#db: IDBDatabase
	readonly #listeners: Partial<{ [Type in Event['type']]: Listener<Type>[] }> = {}

	on<Type extends Event['type']>(type: Type, func: Listener<Type>) {
		this.#listeners[type] = (this.#listeners[type] || []).concat([func])
	}

	off<Type extends Event['type']>(type: Type, func: Listener<Type>) {
		this.#listeners[type] = (this.#listeners[type] || []).filter(fn => fn !== func)
	}

	#emit(data: Event) {
		const listeners: Listener<typeof data.type>[] = this.#listeners[data.type] || []
		listeners.forEach(fn => {
			try {
				fn(data)
			} catch (err) {
				console.error(`unhandled listener exception: ${err.message}`)
			}
		})
	}

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

	async getLastMessage(peer: string): Promise<ChatMessage> {
		const trans = this.#db.transaction('messages', 'readonly')
		const messages = await iterateCursorValue<ChatMessage>(trans.objectStore('messages').openCursor(IDBKeyRange.bound(peer + '_0', peer + '_9'), 'prev'))
		return (await messages.next()).value
	}

	async resetUnreadMessages(peer: string): Promise<void> {
		const trans = this.#db.transaction('messages', 'readwrite')
		for await (const cursor of iterateCursor(trans.objectStore('messages').openCursor(IDBKeyRange.bound(peer + '_0', peer + '_9'), 'prev'))) {
			if (cursor.value.read && !cursor.value.own)
				break

			cursor.update({...cursor.value, read: true})
		}
		this.#emit({type: 'chat', peer})
	}

	async getUnreadMessagesCount(peer: string): Promise<number> {
		const trans = this.#db.transaction('messages', 'readonly')
		let count = 0
		for await (const item of iterateCursorValue<ChatMessage>(trans.objectStore('messages').openCursor(IDBKeyRange.bound(peer + '_0', peer + '_9'), 'prev'))) {
			if (!item.read) count++
			else if (!item.own) break
		}
		return count
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
		this.#emit({type: 'chats'})
	}

	async storeUnsentMessage(peer: string, msg: ChatMessage): Promise<void> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('unsentMessages', 'readwrite')

		let ids = await resolveDbRequest<number[]>(trans.objectStore('unsentMessages').get(peer))
		if (!ids) ids = []
		if (ids.indexOf(msg.id) === -1) ids.push(msg.id)
		await resolveDbRequest(trans.objectStore('unsentMessages').put(ids, peer))
	}

	async removeUnsentMessage(peer: string, msg: ChatMessage) {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('unsentMessages', 'readwrite')

		const ids = await resolveDbRequest<number[]>(trans.objectStore('unsentMessages').get(peer))
		if (!ids)
			return

		const removeIdx = ids.indexOf(msg.id)
		if (removeIdx !== -1) ids.splice(removeIdx, 1)
		await resolveDbRequest(trans.objectStore('unsentMessages').put(ids, peer))
	}

	async getUnsentMessages(peer: string): Promise<ChatMessage[]> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction(['unsentMessages', 'messages'], 'readonly')
		const ids = await resolveDbRequest<number[]>(trans.objectStore('unsentMessages').get(peer))
		if (!ids)
			return []

		const msgs = []
		for (const id of ids)
			msgs.push(await resolveDbRequest(trans.objectStore('messages').get(messageIdToDatabaseKey(peer, id))))

		return msgs
	}

	async storeMessage(peer: string, msg: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction(['messages', 'counters'], 'readwrite')
		let counter = await resolveDbRequest<number>(trans.objectStore('counters').get(peer))
		if (typeof counter !== 'number') counter = 0

		const msgWithId = {...msg, id: counter}
		await resolveDbRequest(trans.objectStore('messages').put(msgWithId, messageIdToDatabaseKey(peer, counter)))
		await resolveDbRequest(trans.objectStore('counters').put(counter + 1, peer))
		this.#emit({type: 'message', peer})
		this.#emit({type: 'chat', peer})
		return msgWithId
	}
}

const db = new Database()
export default db