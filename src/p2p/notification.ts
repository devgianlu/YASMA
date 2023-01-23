import db from './db'
import {ChatMessage} from '../types'
import manager from './peer'

export const initNotifications = () => {
	if (Notification.permission === 'granted') {
		console.log('[Notification]', 'permission is granted')
		setupListeners()
	} else if (Notification.permission !== 'denied') {
		Notification.requestPermission().then((permission) => {
			if (permission === 'granted') {
				console.log('[Notification]', 'permission was granted')
				setupListeners()
			}
		})
	} else {
		console.log('[Notification]', 'permission is denied')
	}
}

const emitMessageNotification = async (peer: string, msg: ChatMessage) => {
	const chat = await db.getChat(peer)
	if (msg.file) new Notification(`New message from ${chat.username} - YASMA`, {body: `File: ${msg.content.split('\x00')[0]}`})
	else new Notification(`New message from ${chat.username} - YASMA`, {body: msg.content})
}

const emitPeerOnlineNotification = (username: string) => {
	new Notification(`${username} is online - YASMA`)
}

const setupListeners = () => {
	db.on('message', ({peer, msg}) => {
		if (msg.own || msg.read)
			return

		emitMessageNotification(peer, msg)
			.catch(err => console.error(`failed emitting message notification: ${err.message}`))
	})
	manager.on('peer', ({username, online}) => {
		if (!online)
			return

		emitPeerOnlineNotification(username)
	})
}