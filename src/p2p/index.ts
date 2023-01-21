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
	await manager.init(
		getSelfId(),
		getSelfUsername(),
		async (peer, text, time): Promise<boolean> => {
			if (!await db.hasChat(peer)) {
				console.log('message from unknown user') // FIXME
				return false
			}

			await db.storeMessage(peer, {text, time, read: false, own: false})
			return true
		},
		async (peer) => {
			const unsent = await db.getUnsentMessages(peer)
			if (unsent.length === 0)
				return

			console.log(`trying to flush ${unsent.length} messages`)
			for (const msg of unsent) {
				try {
					await manager.sendMessage(peer, msg.text, msg.time)
					await db.removeUnsentMessage(peer, msg)
				} catch (err) {
					// ignore
				}
			}
		})

	// Try to connect to all known peers asynchronously
	for (const peerId of await db.getChatIds())
		manager.connectTo(peerId).catch(() => console.error(`failed connecting to peer ${peerId}`))
}

export const deinit = async () => {
	manager.deinit()
}

export const startChat = async (peer: string): Promise<Chat> => {
	const username = await manager.connectTo(peer)
	if (await db.hasChat(peer))
		return db.getChat(peer)

	await db.createChat(peer, username)
	return {peer, username, messages: []}
}

export const sendChatMessage = async (peer: string, text: string): Promise<void> => {
	const time = Date.now()
	const msg = await db.storeMessage(peer, {text, time, read: true, own: true})
	await db.storeUnsentMessage(peer, msg)

	try {
		await manager.sendMessage(peer, text, time)
		await db.removeUnsentMessage(peer, msg)
	} catch (err) {
		console.error(`failed sending message to ${peer} (${err.message}), will retry`)
	}
}
