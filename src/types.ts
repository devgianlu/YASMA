export type ChatItem = {
	peer: string
	username: string
}

export type ChatMessage = {
	id: number
	text: string
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
}

export type PeerHelloAckPacket = {
	type: 'helloAck'
	username: string
}

export type PeerMessagePacket = {
	type: 'msg'
	ackId: number
	text: string
	time: number
}

export type PeerMessageAckPacket = {
	type: 'msgAck'
	ackId: number
}

export type PeerPacket = PeerHelloPacket | PeerHelloAckPacket | PeerMessagePacket | PeerMessageAckPacket