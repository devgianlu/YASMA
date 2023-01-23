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

	manager.on('peer', ({peer, username, online}) => {
		if (!online)
			return

		db.hasChat(peer)
			.then(async ok => {
				if (!ok) {
					await db.createChat(peer, username)
					return
				}

				const unsent = await db.getUnsentMessages(peer)
				if (unsent.length === 0)
					return

				console.log(`trying to flush ${unsent.length} messages`)
				for (const msg of unsent) {
					try {
						if (msg.file) await manager.sendFile(peer, msg.content, msg.time)
						else await manager.sendMessage(peer, msg.content, msg.time)
						await db.removeUnsentMessage(peer, msg)
					} catch (err) {
						// ignore
					}
				}
			})
			.catch(err => console.error(`failed handling peer: ${err.message}`))
	})
	manager.on('message', ({peer, content, time, file}) => {
		db.storeMessage(peer, {content, time, file, read: false, own: false})
			.catch(err => console.error(`failed storing message: ${err.message}`))
	})

	// Try to connect to all known peers asynchronously
	for (const peerId of await db.getChatIds())
		manager.connectTo(peerId).catch(() => console.error(`failed connecting to peer ${peerId}`))
}

export const deinit = () => {
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
	const msg = await db.storeMessage(peer, {content: text, time, file: false, read: true, own: true})
	await db.storeUnsentMessage(peer, msg)

	try {
		await manager.sendMessage(peer, text, time)
		await db.removeUnsentMessage(peer, msg)
	} catch (err) {
		console.error(`failed sending message to ${peer} (${err.message}), will retry`)
	}
}

export const sendChatFile = async (peer: string, file: File): Promise<void> => {
	const content = await new Promise<string>((accept, reject) => {
		const reader = new FileReader()
		reader.onload = () => accept(file.name + '\x00' + window.btoa(reader.result as string))
		reader.onerror = () => reject(reader.error)
		reader.readAsBinaryString(file)
	})

	const time = Date.now()
	const msg = await db.storeMessage(peer, {content, time, file: true, read: true, own: true})
	await db.storeUnsentMessage(peer, msg)

	try {
		await manager.sendFile(peer, content, time)
		await db.removeUnsentMessage(peer, msg)
	} catch (err) {
		console.error(`failed sending file to ${peer} (${err.message}), will retry`)
	}
}
