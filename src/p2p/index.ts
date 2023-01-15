import {Chat, ChatItem} from '../types'
import {openDb, resolveDbRequest} from './db'
import manager from './peer'

const getSelfId = (): string => {
	let id = localStorage.getItem('yasma_self_id')
	if (!id) {
		id = crypto.randomUUID()
		localStorage.setItem('yasma_self_id', id)
	}
	return id
}

const getSelfUsername = (): string => {
	const username = localStorage.getItem('yasma_username')
	if (!username)
		throw new Error('Missing username!')
	return username
}

export const init = async () => {
	await manager.init(getSelfId(), getSelfUsername())

	manager.onmessage = async (peer, text) => {
		const db = await openDb()
		const trans = db.transaction(['chats', 'messages'], 'readwrite')
		const user = await resolveDbRequest(trans.objectStore('chats').get(peer))
		if (!user) {
			console.log('message from unknown user') // FIXME
			return
		}

		await resolveDbRequest(trans.objectStore('messages').put({text}, peer + '_' + new Date().getTime()))
	}

	const db = await openDb()
	const trans = db.transaction('chats', 'readonly')
	for (const id of await resolveDbRequest(trans.objectStore('chats').getAllKeys()))
		await manager.connectTo(id as string)
}

export const startChat = async (id: string): Promise<Chat> => {
	const [peer, username] = await manager.connectTo(id)

	const db = await openDb()
	const trans = db.transaction('chats', 'readwrite')
	await resolveDbRequest(trans.objectStore('chats').put({peer, username}, peer))
	return {peer, username, messages: []}
}

export const getChats = async (): Promise<ChatItem[]> => {
	const db = await openDb()
	const trans = db.transaction('chats', 'readonly')
	return await resolveDbRequest(trans.objectStore('chats').getAll())
}

export const getChat = async (peer: string): Promise<Chat> => {
	const db = await openDb()
	const trans = db.transaction(['chats', 'messages'], 'readonly')
	const user = await resolveDbRequest(trans.objectStore('chats').get(peer))
	if (!user)
		return undefined

	const messages = await resolveDbRequest(trans.objectStore('messages').getAll(IDBKeyRange.bound(peer + '_0', peer + '_9')))

	return {
		peer, username:
		user.username,
		messages: messages.map(x => {
			return {text: x, time: 0, read: false}
		})
	}
}

export const sendChatMessage = async (peer: string, text: string): Promise<void> => {
	manager.sendMessage(peer, text)
}
