import {Chat, ChatItem, ChatMessage} from '../types'
import * as Crypto from 'crypto-js'

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

const resolve = <T>(req: IDBRequest<T>): Promise<T> => {
	return new Promise((accept, reject) => {
		req.addEventListener('success', () => accept(req.result))
		req.addEventListener('error', () => reject(req.error))
	})
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
	msg: ChatMessage
}
type Event = ChatsEvent | ChatEvent | MessageEvent

type Listener<Type extends Event['type']> = (data: Readonly<Event & { type: Type }>) => void

type EncryptedData = {
	__encrypted__: string
}

class Database {
	#db: IDBDatabase
	#key: string
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

	setKey(key: string) {
		this.#key = key
	}

	#decrypt<T>(item: EncryptedData | T): T {
		if (typeof item === 'object' && '__encrypted__' in item)
			return JSON.parse(Crypto.AES.decrypt(item['__encrypted__'], this.#key).toString(Crypto.enc.Utf8))

		return item
	}

	#encrypt<T>(item: T): EncryptedData | T {
		if (this.#key)
			return {'__encrypted__': Crypto.AES.encrypt(JSON.stringify(item), this.#key).toString()}

		return item
	}

	#resolveGet<T>(req: IDBRequest<T>): Promise<T> {
		return new Promise<T>((accept, reject) => {
			req.addEventListener('success', () => accept(this.#decrypt(req.result)))
			req.addEventListener('error', () => reject(req.error))
		})
	}

	#resolveGetAll<T>(req: IDBRequest<T[]>): Promise<T[]> {
		return new Promise<T[]>((accept, reject) => {
			req.addEventListener('success', () => accept(req.result.map(this.#decrypt.bind(this))))
			req.addEventListener('error', () => reject(req.error))
		})
	}

	async* #iterateCursor<T extends object>(req: IDBRequest<IDBCursorWithValue>): AsyncGenerator<[IDBCursorWithValue, T]> {
		while (true) {
			const cursor = await resolve<IDBCursorWithValue | null>(req)
			if (!cursor)
				break

			yield [cursor, this.#decrypt<T>(cursor.value)]
			cursor.continue()
		}
	}

	async #ensureDbReady() {
		if (this.#db)
			return

		this.#db = await openDb()
	}

	async getChatIds(): Promise<string[]> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('chats', 'readonly')
		return await resolve(trans.objectStore('chats').getAllKeys()) as string[]
	}

	async getChats(): Promise<ChatItem[]> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('chats', 'readonly')
		return await this.#resolveGetAll(trans.objectStore('chats').getAll())
	}

	async hasChat(peer: string): Promise<boolean> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('chats', 'readonly')
		return await resolve(trans.objectStore('chats').count(peer)) > 0
	}

	async getLastMessage(peer: string): Promise<ChatMessage> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('messages', 'readonly')
		const messages = this.#iterateCursor<ChatMessage>(trans.objectStore('messages').openCursor(IDBKeyRange.bound(peer + '_0', peer + '_9'), 'prev'))
		const value = (await messages.next()).value
		if (!value) return undefined
		return value[1]
	}

	async resetUnreadMessages(peer: string): Promise<void> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('messages', 'readwrite')
		for await (const [cursor, item] of this.#iterateCursor<ChatMessage>(trans.objectStore('messages').openCursor(IDBKeyRange.bound(peer + '_0', peer + '_9'), 'prev'))) {
			if (item.read && !item.own)
				break

			cursor.update(this.#encrypt<ChatMessage>({...item, read: true}))
		}
		this.#emit({type: 'chat', peer})
	}

	async getUnreadMessagesCount(peer: string): Promise<number> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('messages', 'readonly')
		let count = 0
		for await (const [, item] of this.#iterateCursor<ChatMessage>(trans.objectStore('messages').openCursor(IDBKeyRange.bound(peer + '_0', peer + '_9'), 'prev'))) {
			if (!item.read) count++
			else if (!item.own) break
		}
		return count
	}

	async getChat(peer: string): Promise<Chat> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction(['chats', 'messages'], 'readonly')
		const user = await this.#resolveGet<Chat>(trans.objectStore('chats').get(peer))
		if (!user)
			return undefined

		const messages = await this.#resolveGetAll<ChatMessage>(trans.objectStore('messages').getAll(IDBKeyRange.bound(peer + '_0', peer + '_9')))

		return {
			peer,
			messages,
			username: user.username,
		}
	}

	async createChat(peer: string, username: string): Promise<void> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('chats', 'readwrite')
		await resolve(trans.objectStore('chats').put(this.#encrypt<Chat>({peer, username, messages: []}), peer))
		this.#emit({type: 'chats'})
		this.#emit({type: 'chat', peer})
	}

	async storeUnsentMessage(peer: string, msg: ChatMessage): Promise<void> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('unsentMessages', 'readwrite')

		let ids = await this.#resolveGet<number[]>(trans.objectStore('unsentMessages').get(peer))
		if (!ids) ids = []
		if (ids.indexOf(msg.id) === -1) ids.push(msg.id)
		await resolve(trans.objectStore('unsentMessages').put(this.#encrypt<number[]>(ids), peer))
	}

	async removeUnsentMessage(peer: string, msg: ChatMessage) {
		await this.#ensureDbReady()
		const trans = this.#db.transaction('unsentMessages', 'readwrite')

		const ids = await this.#resolveGet<number[]>(trans.objectStore('unsentMessages').get(peer))
		if (!ids)
			return

		const removeIdx = ids.indexOf(msg.id)
		if (removeIdx !== -1) ids.splice(removeIdx, 1)
		await resolve(trans.objectStore('unsentMessages').put(this.#encrypt<number[]>(ids), peer))
		this.#emit({type: 'chat', peer})
	}

	async getUnsentMessages(peer: string): Promise<ChatMessage[]> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction(['unsentMessages', 'messages'], 'readonly')
		const ids = await this.#resolveGet<number[]>(trans.objectStore('unsentMessages').get(peer))
		if (!ids)
			return []

		const msgs = []
		for (const id of ids)
			msgs.push(await this.#resolveGet<ChatMessage>(trans.objectStore('messages').get(messageIdToDatabaseKey(peer, id))))

		return msgs
	}

	async storeMessage(peer: string, msg: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
		await this.#ensureDbReady()
		const trans = this.#db.transaction(['messages', 'counters'], 'readwrite')
		let counter = await this.#resolveGet<number>(trans.objectStore('counters').get(peer))
		if (typeof counter !== 'number') counter = 0

		const msgWithId = {...msg, id: counter}
		await resolve(trans.objectStore('messages').put(this.#encrypt<ChatMessage>(msgWithId), messageIdToDatabaseKey(peer, counter)))
		await resolve(trans.objectStore('counters').put(this.#encrypt<number>(counter + 1), peer))
		this.#emit({type: 'message', peer, msg: msgWithId})
		this.#emit({type: 'chat', peer})
		return msgWithId
	}
}

const db = new Database()
export default db