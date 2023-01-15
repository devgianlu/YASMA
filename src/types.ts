export type ChatItem = {
	peer: string
	username: string
	lastMessage?: string
	unreadMessages: number
}

export type ChatMessage = {
	text: string
	time: number
	read: boolean
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
	text: string
}

export type PeerPacket = PeerHelloPacket | PeerHelloAckPacket | PeerMessagePacket