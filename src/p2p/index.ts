import {Chat} from '../types'
import db from './db'
import manager from './peer'
import enc, {decryptSymmetric, deriveSymmetricKey, encryptSymmetric, generateMasterKey} from './enc'

export const setupRequired = () => {
	return !localStorage.getItem('yasma_self_id') || !localStorage.getItem('yasma_salt')
}

export const firstSetup = async (username: string, passphrase: string) => {
	const id = 'yasma_' + window.crypto.randomUUID()
	const masterKey = await generateMasterKey()
	const salt = window.crypto.randomUUID()
	const encKey = await deriveSymmetricKey(passphrase, salt)

	localStorage.setItem('yasma_salt', salt)
	localStorage.setItem('yasma_self_id', await encryptSymmetric(encKey, id))
	localStorage.setItem('yasma_username', await encryptSymmetric(encKey, username))
	localStorage.setItem('yasma_master_key', await encryptSymmetric(encKey, JSON.stringify(masterKey)))

	return {id, username, encKey, masterKey}
}

export const initEncryption = async (passphrase: string): Promise<{ username: string, id: string, encKey: CryptoKey, masterKey: [JsonWebKey, JsonWebKey] }> => {
	const storedId = localStorage.getItem('yasma_self_id'), salt = localStorage.getItem('yasma_salt')
	if (!storedId || !salt)
		throw new Error('missing id and/or salt')

	const encKey = await deriveSymmetricKey(passphrase, salt)

	let id, username, masterKey: [JsonWebKey, JsonWebKey]
	try {
		id = await decryptSymmetric(encKey, storedId)
		username = await decryptSymmetric(encKey, localStorage.getItem('yasma_username'))
		masterKey = JSON.parse(await decryptSymmetric(encKey, localStorage.getItem('yasma_master_key')))
	} catch (err) {
		throw new Error(`failed decrypting: ${err.message}`)
	}

	return {username, id, encKey, masterKey}
}

export const init = async (localPeerId: string, localUsername: string) => {
	await manager.init(localPeerId, localUsername)

	manager.on('peer', ({peer, username, publicKey, online}) => {
		if (!online)
			return

		(async () => {
			await db.storePublicKey(peer, publicKey)

			if (!(await db.hasChat(peer))) {
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
		})().catch(err => console.error(`failed handling peer ${peer}: ${err.message}`))
	})
	manager.on('message', ({peer, content, time, file}) => {
		(async () => {
			const publicKeyData = await db.loadPublicKey(peer)
			if (!publicKeyData)
				throw new Error('no public key')

			const [plainContent, verified] = await enc.verifyMessage(content, publicKeyData)

			await db.storeMessage(peer, {content: plainContent, time, file, read: false, own: false, verified})
		})().catch(err => console.error(`failed handling message from ${peer}: ${err.message}`))
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
	const msg = await db.storeMessage(peer, {content: text, time, file: false, read: true, own: true, verified: true})
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
		reader.onload = () => accept(file.name + '\x00' + reader.result as string)
		reader.onerror = () => reject(reader.error)
		reader.readAsBinaryString(file)
	})

	const time = Date.now()
	const msg = await db.storeMessage(peer, {content, time, file: true, read: true, own: true, verified: true})
	await db.storeUnsentMessage(peer, msg)

	try {
		await manager.sendFile(peer, content, time)
		await db.removeUnsentMessage(peer, msg)
	} catch (err) {
		console.error(`failed sending file to ${peer} (${err.message}), will retry`)
	}
}
