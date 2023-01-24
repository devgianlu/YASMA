import {DataConnection} from 'peerjs'

export type ChatItem = {
	peer: string
	username: string
}

export type ChatMessage = {
	id: number
	file: boolean
	content: string
	time: number
	read: boolean
	own: boolean
}

export type Chat = {
	peer: string
	username: string
	messages: ChatMessage[]
}

export type PeerHelloPacket = {
	type: 'hello'
	username: string
	publicKey: JsonWebKey
}

export type PeerHelloAckPacket = {
	type: 'helloAck'
	username: string
	publicKey: JsonWebKey
}

export type PeerMessagePacket = {
	type: 'msg'
	file: boolean
	ackId: number
	content: string
	time: number
}

export type PeerMessageAckPacket = {
	type: 'msgAck'
	ackId: number
}

export type PeerPacket = PeerHelloPacket | PeerHelloAckPacket | PeerMessagePacket | PeerMessageAckPacket

export type OnMessageListener = (peer: string, username: string, file: boolean, content: string, time: number) => void
export type OnPeerListener = (peer: string, username: string, publicKey: JsonWebKey, online: boolean) => void

export class PeerError extends Error {
	constructor(msg: string)
	constructor(conn: DataConnection, msg: string)
	constructor(msgOrConn: DataConnection | string, msg?: string) {
		if (typeof msgOrConn == 'string') super(msgOrConn)
		else super(`[${msgOrConn.peer}] ${msg}`)
	}
}