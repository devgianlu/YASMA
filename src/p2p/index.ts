import {Chat} from '../types'
import db from './db'
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
		if (!await db.hasChat(peer)) {
			console.log('message from unknown user') // FIXME
			return
		}

		await db.storeMessage(peer, {
			text,
			read: false,
			own: false,
			time: Date.now() /* TODO: time should be sent with message */
		})
	}

	// Try to connect to all know peers asynchronously
	for (const id of await db.getChatIds())
		manager.connectTo(id as string).catch(() => console.error(`failed connecting to peer ${id}`))
}

export const startChat = async (id: string): Promise<Chat> => {
	const [peer, username] = await manager.connectTo(id)
	if (await db.hasChat(peer))
		return db.getChat(peer)

	await db.createChat(peer, username)
	return {peer, username, messages: []}
}

export const sendChatMessage = async (peer: string, text: string): Promise<void> => {
	await manager.sendMessage(peer, text)
	await db.storeMessage(peer, {text, read: true, own: true, time: Date.now()})
}
