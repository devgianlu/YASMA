import {Chat, ChatItem, ChatMessage} from '../types'
import {decryptSymmetric, encryptSymmetric} from './enc'

const openDb = async (): Promise<IDBDatabase> => {
	return new Promise((accept, reject) => {
		const req = self.indexedDB.open('yasm', 3)

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
				// eslint-disable-next-line no-fallthrough
				case 1:
					req.result.createObjectStore('publicKeys')
				// eslint-disable-next-line no-fallthrough
				case 2:
					req.result.createObjectStore('unreadMessages')
			}
		})
		req.addEventListener('error', () => {
			reject(req.error)
		})
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
	#key: CryptoKey
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

	setSymmetricKey(key: CryptoKey) {
		this.#key = key
	}

	async #decrypt<T>(item: EncryptedData): Promise<T> {
		if (!this.#key) {
			await new Promise(accept => setTimeout(accept, 5000)) // FIXME: HUGE HACK

			if (!this.#key)
				throw new Error('Missing encryption key')
		}

		if (item === undefined)
			return undefined

		return JSON.parse(await decryptSymmetric(this.#key, item['__encrypted__']))
	}

	async #encrypt<T>(item: T): Promise<EncryptedData> {
		if (!this.#key) {
			await new Promise(accept => setTimeout(accept, 5000)) // FIXME: HUGE HACK

			if (!this.#key)
				throw new Error('Missing encryption key')
		}

		return {'__encrypted__': await encryptSymmetric(this.#key, JSON.stringify(item))}
	}

	async #put<T>(objectStore: string, key: IDBValidKey, value: T) {
		await this.#ensureDbReady()
		const encrypted = await this.#encrypt<T>(value)
		await new Promise<void>((accept, reject) => {
			const trans = this.#db.transaction(objectStore, 'readwrite')
			const req = trans.objectStore(objectStore).put(encrypted, key)
			req.addEventListener('success', () => accept())
			req.addEventListener('error', () => reject(req.error))
		})
	}

	async #get<T>(objectStore: string, query: IDBValidKey): Promise<T> {
		await this.#ensureDbReady()
		return await this.#decrypt<T>(await new Promise<EncryptedData>((accept, reject) => {
			const trans = this.#db.transaction(objectStore, 'readonly')
			const req = trans.objectStore(objectStore).get(query)
			req.addEventListener('success', () => accept(req.result))
			req.addEventListener('error', () => reject(req.error))
		}))
	}

	async #getFirst<T>(objectStore: string, query: IDBKeyRange, direction: 'prev' | 'next'): Promise<T> {
		await this.#ensureDbReady()
		return await this.#decrypt<T>(await new Promise<EncryptedData>((accept, reject) => {
			const trans = this.#db.transaction(objectStore, 'readonly')
			const req = trans.objectStore('messages').openCursor(query, direction)
			req.addEventListener('success', () => accept(req.result?.value || undefined))
			req.addEventListener('error', () => reject(req.error))
		}))
	}

	async #getAllKeys(objectStore: string): Promise<IDBValidKey[]> {
		await this.#ensureDbReady()
		return await new Promise((accept, reject) => {
			const trans = this.#db.transaction(objectStore, 'readonly')
			const req = trans.objectStore(objectStore).getAllKeys()
			req.addEventListener('success', () => accept(req.result))
			req.addEventListener('error', () => reject(req.error))
		})
	}

	async #getAll<T>(objectStore: string, query?: IDBKeyRange): Promise<T[]> {
		await this.#ensureDbReady()
		return Promise.all((await new Promise<EncryptedData[]>((accept, reject) => {
			const trans = this.#db.transaction(objectStore, 'readonly')
			const req = trans.objectStore(objectStore).getAll(query)
			req.addEventListener('success', () => accept(req.result))
			req.addEventListener('error', () => reject(req.error))
		})).map(this.#decrypt.bind(this)))
	}

	async #count(objectStore: string, query?: IDBValidKey | IDBKeyRange): Promise<number> {
		await this.#ensureDbReady()
		return new Promise((accept, reject) => {
			const trans = this.#db.transaction(objectStore, 'readonly')
			const req = trans.objectStore(objectStore).count(query)
			req.addEventListener('success', () => accept(req.result))
			req.addEventListener('error', () => reject(req.error))
		})
	}

	async #ensureDbReady() {
		if (this.#db)
			return

		this.#db = await openDb()
	}

	async getChatIds(): Promise<string[]> {
		return await this.#getAllKeys('chats') as string[]
	}

	async getChats(): Promise<ChatItem[]> {
		return await this.#getAll('chats')
	}

	async hasChat(peer: string): Promise<boolean> {
		return await this.#count('chats', peer) > 0
	}

	async getLastMessage(peer: string): Promise<ChatMessage> {
		return this.#getFirst('messages', IDBKeyRange.bound(peer + '_0', peer + '_9'), 'prev')
	}

	async resetUnreadMessages(peer: string): Promise<void> {
		await this.#put('unreadMessages', peer, [])
		this.#emit({type: 'chat', peer})
	}

	async getUnreadMessagesCount(peer: string): Promise<number> {
		const ids = await this.#get<number[]>('unreadMessages', peer)
		return (ids || []).length
	}

	async getChat(peer: string): Promise<Chat> {
		const user = await this.#get<Chat>('chats', peer)
		if (!user)
			return undefined

		const messages = await this.#getAll<ChatMessage>('messages', IDBKeyRange.bound(peer + '_0', peer + '_9'))
		return {peer, messages, username: user.username}
	}

	async createChat(peer: string, username: string): Promise<void> {
		await this.#put<Chat>('chats', peer, {peer, username, messages: []})
		this.#emit({type: 'chats'})
		this.#emit({type: 'chat', peer})
	}

	async storeUnsentMessage(peer: string, msg: ChatMessage): Promise<void> {
		let ids = await this.#get<number[]>('unsentMessages', peer)
		if (!ids) ids = []
		if (ids.indexOf(msg.id) === -1) ids.push(msg.id)
		await this.#put<number[]>('unsentMessages', peer, ids)
	}

	async removeUnsentMessage(peer: string, msg: ChatMessage) {
		const ids = await this.#get<number[]>('unsentMessages', peer)
		if (!ids)
			return

		const removeIdx = ids.indexOf(msg.id)
		if (removeIdx !== -1) ids.splice(removeIdx, 1)
		await this.#put<number[]>('unsentMessages', peer, ids)
		this.#emit({type: 'chat', peer})
	}

	async getUnsentMessages(peer: string): Promise<ChatMessage[]> {
		const ids = await this.#get<number[]>('unsentMessages', peer)
		if (!ids)
			return []

		const msgs = []
		for (const id of ids)
			msgs.push(await this.#get<ChatMessage>('messages', messageIdToDatabaseKey(peer, id)))

		return msgs
	}

	async storeMessage(peer: string, msg: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
		let counter = await this.#get<number>('counters', peer)
		if (typeof counter !== 'number') counter = 0

		const msgWithId = {...msg, id: counter}
		await this.#put<ChatMessage>('messages', messageIdToDatabaseKey(peer, counter), msgWithId)
		await this.#put<number>('counters', peer, counter + 1)
		this.#emit({type: 'message', peer, msg: msgWithId})
		this.#emit({type: 'chat', peer})
		return msgWithId
	}

	async loadPublicKey(peer: string): Promise<JsonWebKey> {
		return await this.#get<JsonWebKey>('publicKeys', peer)
	}

	async storePublicKey(peer: string, key: JsonWebKey) {
		const currentKey = await this.loadPublicKey(peer)
		if (!currentKey) {
			await this.#put<JsonWebKey>('publicKeys', peer, key)
			return
		}

		// TODO: verify keys are equal!
	}
}

const db = new Database()
export default db