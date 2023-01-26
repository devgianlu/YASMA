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
export type PublicKeyChangedEvent = {
	type: 'publicKeyChanged'
	peer: string
	username: string | null
}
type Event = ChatsEvent | ChatEvent | MessageEvent | PublicKeyChangedEvent

type Listener<Type extends Event['type']> = (data: Readonly<Event & { type: Type }>) => void

type EncryptedData = {
	__encrypted__: string
}

type DbTypes = {
	'chats': Chat
	'messages': Omit<ChatMessage, 'read'>
	'unreadMessages': number[]
	'unsentMessages': number[]
	'counters': number
	'publicKeys': JsonWebKey
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
		if (!this.#key)
			throw new Error('Missing encryption key')

		if (item === undefined)
			return undefined

		return JSON.parse(await decryptSymmetric(this.#key, item['__encrypted__']))
	}

	async #encrypt<T>(item: T): Promise<EncryptedData> {
		if (!this.#key)
			throw new Error('Missing encryption key')

		return {'__encrypted__': await encryptSymmetric(this.#key, JSON.stringify(item))}
	}

	async #put<T extends keyof DbTypes>(objectStore: T, key: IDBValidKey, value: DbTypes[T]) {
		await this.#ensureDbReady()
		const encrypted = await this.#encrypt<DbTypes[T]>(value)
		await new Promise<void>((accept, reject) => {
			const trans = this.#db.transaction(objectStore, 'readwrite')
			const req = trans.objectStore(objectStore).put(encrypted, key)
			req.addEventListener('success', () => accept())
			req.addEventListener('error', () => reject(req.error))
		})
	}

	async #get<T extends keyof DbTypes>(objectStore: T, query: IDBValidKey): Promise<DbTypes[T]> {
		await this.#ensureDbReady()
		return await this.#decrypt<DbTypes[T]>(await new Promise<EncryptedData>((accept, reject) => {
			const trans = this.#db.transaction(objectStore, 'readonly')
			const req = trans.objectStore(objectStore).get(query)
			req.addEventListener('success', () => accept(req.result))
			req.addEventListener('error', () => reject(req.error))
		}))
	}

	async #getFirst<T extends keyof DbTypes>(objectStore: T, query: IDBKeyRange, direction: 'prev' | 'next'): Promise<DbTypes[T]> {
		await this.#ensureDbReady()
		return await this.#decrypt<DbTypes[T]>(await new Promise<EncryptedData>((accept, reject) => {
			const trans = this.#db.transaction(objectStore, 'readonly')
			const req = trans.objectStore('messages').openCursor(query, direction)
			req.addEventListener('success', () => accept(req.result?.value || undefined))
			req.addEventListener('error', () => reject(req.error))
		}))
	}

	async #getAllKeys<T extends keyof DbTypes>(objectStore: T): Promise<IDBValidKey[]> {
		await this.#ensureDbReady()
		return await new Promise((accept, reject) => {
			const trans = this.#db.transaction(objectStore, 'readonly')
			const req = trans.objectStore(objectStore).getAllKeys()
			req.addEventListener('success', () => accept(req.result))
			req.addEventListener('error', () => reject(req.error))
		})
	}

	async #getAll<T extends keyof DbTypes>(objectStore: T, query?: IDBKeyRange): Promise<DbTypes[T][]> {
		await this.#ensureDbReady()
		return Promise.all((await new Promise<EncryptedData[]>((accept, reject) => {
			const trans = this.#db.transaction(objectStore, 'readonly')
			const req = trans.objectStore(objectStore).getAll(query)
			req.addEventListener('success', () => accept(req.result))
			req.addEventListener('error', () => reject(req.error))
		})).map(this.#decrypt.bind(this)))
	}

	async #count<T extends keyof DbTypes>(objectStore: T, query?: IDBValidKey | IDBKeyRange): Promise<number> {
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
		const msg = await this.#getFirst('messages', IDBKeyRange.bound(peer + '_0', peer + '_9'), 'prev')
		if (!msg)
			return undefined

		const unreadIds = await this.#get('unreadMessages', peer)
		const read = !unreadIds.includes(msg.id)
		return {...msg, read}
	}

	async resetUnreadMessages(peer: string): Promise<void> {
		await this.#put('unreadMessages', peer, [])
		this.#emit({type: 'chat', peer})
	}

	async getUnreadMessagesCount(peer: string): Promise<number> {
		const ids = await this.#get('unreadMessages', peer)
		return (ids || []).length
	}

	async #storeUnreadMessage(peer: string, msg: ChatMessage) {
		if (msg.own)
			throw new Error('Own messages cannot be be unread!')

		let ids = await this.#get('unreadMessages', peer)
		if (!ids) ids = []
		if (!ids.includes(msg.id)) ids.push(msg.id)
		await this.#put('unreadMessages', peer, ids)
	}

	async getChat(peer: string): Promise<Chat> {
		const user = await this.#get('chats', peer)
		if (!user)
			return undefined

		const unreadIds = await this.#get('unreadMessages', peer)
		const messages = await this.#getAll('messages', IDBKeyRange.bound(peer + '_0', peer + '_9'))

		return {
			peer,
			username: user.username,
			messages: messages.map(x => {
				return {...x, read: !unreadIds.includes(x.id)}
			}),
		}
	}

	async createChat(peer: string, username: string): Promise<void> {
		await this.#put('chats', peer, {peer, username, messages: []})
		this.#emit({type: 'chats'})
		this.#emit({type: 'chat', peer})
	}

	async storeUnsentMessage(peer: string, msg: ChatMessage): Promise<void> {
		if (!msg.own)
			throw new Error('Only own messages can be unsent!')

		let ids = await this.#get('unsentMessages', peer)
		if (!ids) ids = []
		if (!ids.includes(msg.id)) ids.push(msg.id)
		await this.#put('unsentMessages', peer, ids)
	}

	async removeUnsentMessage(peer: string, msg: ChatMessage) {
		const ids = await this.#get('unsentMessages', peer)
		if (!ids)
			return

		const removeIdx = ids.indexOf(msg.id)
		if (removeIdx !== -1) ids.splice(removeIdx, 1)
		await this.#put('unsentMessages', peer, ids)
		this.#emit({type: 'chat', peer})
	}

	async getUnsentMessages(peer: string): Promise<ChatMessage[]> {
		const ids = await this.#get('unsentMessages', peer)
		if (!ids)
			return []

		const msgs = []
		for (const id of ids)
			msgs.push(await this.#get('messages', messageIdToDatabaseKey(peer, id)))

		return msgs.map(x => {
			// our own messages are always read
			return {...x, read: true}
		})
	}

	async storeMessage(peer: string, msg: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
		let counter = await this.#get('counters', peer)
		if (typeof counter !== 'number') counter = 0

		// We store the "read" field separately
		const msgWithId = {id: counter, file: msg.file, content: msg.content, time: msg.time, own: msg.own, verified: msg.verified}
		await this.#put('messages', messageIdToDatabaseKey(peer, counter), msgWithId)
		await this.#put('counters', peer, counter + 1)

		const msgComplete = {...msgWithId, read: msg.read}
		if (!msg.read)
			await this.#storeUnreadMessage(peer, msgComplete)

		this.#emit({type: 'message', peer, msg: msgComplete})
		this.#emit({type: 'chat', peer})
		return msgComplete
	}

	async loadPublicKey(peer: string): Promise<JsonWebKey> {
		return await this.#get('publicKeys', peer)
	}

	async storePublicKey(peer: string, key: JsonWebKey) {
		const currentKey = await this.loadPublicKey(peer)
		if (!currentKey) {
			await this.#put('publicKeys', peer, key)
			return
		}

		if (JSON.stringify(key) !== JSON.stringify(currentKey)) {
			let username = null
			const chat = await db.getChat(peer)
			if (chat) username = chat.username

			this.#emit({type: 'publicKeyChanged', peer, username})
		}
	}
}

const db = new Database()
export default db