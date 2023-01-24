import {DataConnection, Peer} from 'peerjs'
import {PeerError} from '../types'
import {ConnManager} from './conn'
import enc from './enc'


export type PeerEvent = {
	type: 'peer'
	peer: string
	username: string
	publicKey: JsonWebKey
	online: boolean
}
export type MessageEvent = {
	type: 'message'
	peer: string
	username: string
	file: boolean
	content: string
	time: number
}
type Event = PeerEvent | MessageEvent

type Listener<Type extends Event['type']> = (data: Readonly<Event & { type: Type }>) => void

const CHECK_INTERVAL_MS = 10000

class PeerManager {
	readonly #conns: { [key: string]: ConnManager } = {}
	readonly #listeners: Partial<{ [Type in Event['type']]: Listener<Type>[] }> = {}

	#peer: Peer
	#username: string

	#log(msg: string): void {
		console.log('[P2P]', msg)
	}

	async init(id: string, username: string) {
		this.#username = username
		this.#peer = new Peer(id, {debug: 2})
		this.#peer.on('connection', this.#handleConnection, this)
		await new Promise<void>((accept, reject) => {
			const open = () => {
				this.#peer.off('open', open)
				this.#peer.off('error', error)
				this.#log(`initialized peer: ${id} (${username})`)
				accept()
			}
			const error = (err: Error) => {
				this.#peer.off('open', open)
				this.#peer.off('error', error)
				reject(new PeerError(`failed initializing peer ${id} (${username}): ${err}`))
			}

			this.#peer.on('open', open, this)
			this.#peer.on('error', error, this)
		})

		setInterval(() => {
			for (const [peer, conn] of Object.entries(this.#conns)) {
				if (conn.dead)
					this.#emit({type: 'peer', peer, username: conn.username, publicKey: conn.publicKey, online: false})
			}
		}, CHECK_INTERVAL_MS)
	}

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

	#newConnManager(conn: DataConnection) {
		const connManager = new ConnManager(conn,
			(peer, username, publicKey, online) => {
				this.#emit({type: 'peer', peer, username, publicKey, online})
			},
			(peer, username, file, content, time) => {
				this.#emit({type: 'message', peer, username, file, content, time})
			})
		this.#conns[conn.peer] = connManager
		return connManager
	}

	#handleConnection(conn: DataConnection) {
		this.#log(`incoming connection: ${conn.peer}`)

		let connManager = this.#conns[conn.peer]
		if (!connManager || connManager.dead) {
			connManager = this.#newConnManager(conn)
			connManager.handshakeIncoming(this.#username).catch(err => {
				this.#log(`failed incoming handshake from ${conn.peer}: ${err.message}`)
			})
		}
	}

	async connectTo(peer: string): Promise<string> {
		if (!this.#peer)
			throw new PeerError('peer not ready')
		if (!peer.startsWith('yasma_'))
			throw new PeerError('invalid peer id')

		let connManager = this.#conns[peer]
		if (!connManager || connManager.dead) {
			connManager = this.#newConnManager(this.#peer.connect(peer))
			await connManager.handshakeOutgoing(this.#username)
		} else if (connManager.connecting) {
			await connManager.waitConnected()
		} else if (!connManager.connected) {
			throw new PeerError('unknown state')
		}

		return connManager.username
	}

	async sendMessage(peer: string, text: string, time: number): Promise<void> {
		const conn = this.#conns[peer]
		if (!conn)
			throw new PeerError('unknown peer')

		const textWithSignature = await enc.signMessage(text)
		await conn.sendMessage(textWithSignature, time, false)
	}

	async sendFile(peer: string, content: string, time: number): Promise<void> {
		const conn = this.#conns[peer]
		if (!conn)
			throw new PeerError('unknown peer')

		const contentWithSignature = await enc.signMessage(content)
		await conn.sendMessage(contentWithSignature, time, true)
	}

	deinit() {
		for (const conn of Object.values(this.#conns)) conn.close()
		this.#peer.destroy()
	}

	get username() {
		return this.#username || ''
	}

	get peerId() {
		return this.#peer && this.#peer.id || ''
	}
}


const manager = new PeerManager()
export default manager
