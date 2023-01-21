import {DataConnection, Peer} from 'peerjs'
import {PeerHelloAckPacket, PeerHelloPacket, PeerMessageAckPacket, PeerMessagePacket, PeerPacket} from '../types'

class PeerError extends Error {
	constructor(msg: string)
	constructor(conn: DataConnection, msg: string)
	constructor(msgOrConn: DataConnection | string, msg?: string) {
		if (typeof msgOrConn == 'string') super(msgOrConn)
		else super(`[${msgOrConn.peer}] ${msg}`)
	}
}

type OnMessageListener = (peer: string, text: string, time: number) => Promise<boolean>
type OnPeerListener = (peer: string, username: string) => Promise<void>

type PacketListener<Type extends PeerPacket['type']> = (data: Readonly<PeerPacket & { type: Type }>) => void

const TIMEOUT_MS = 5000

class ConnManager {
	readonly #conn: DataConnection
	readonly #listeners: Partial<{ [Type in PeerPacket['type']]: [PacketListener<Type>, boolean][] }> = {}
	readonly #onmessage: OnMessageListener
	#username: string

	constructor(conn: DataConnection, onmessage: OnMessageListener) {
		this.#conn = conn
		this.#onmessage = onmessage

		this.on('msg', (data: PeerMessagePacket) => {
			this.#onmessage(this.#conn.peer, data.text, data.time)
				.then(async ok => {
					if (!ok) {
						this.#log(`refusing to ack message ${data.ackId}`)
						return
					}

					this.#log(`sending message ack for ${data.ackId}`)
					await this.send({type: 'msgAck', ackId: data.ackId})
				})
				.catch(err => {
					this.#log(`failed handling message ${data.ackId}: ${err}`)
					return
				})
		})
	}

	on<Type extends PeerPacket['type']>(type: Type, func: PacketListener<Type>) {
		this.#listeners[type] = (this.#listeners[type] || []).concat([[func, false]])
	}

	once<Type extends PeerPacket['type']>(type: Type, func: PacketListener<Type>) {
		this.#listeners[type] = (this.#listeners[type] || []).concat([[func, true]])
	}

	off<Type extends PeerPacket['type']>(type: Type, func: PacketListener<Type>) {
		this.#listeners[type] = (this.#listeners[type] || []).filter(([fn]) => fn !== func)
	}

	#emit(data: PeerPacket) {
		const listeners: [PacketListener<typeof data.type>, boolean][] = this.#listeners[data.type] || []
		for (let i = listeners.length - 1; i >= 0; i--) {
			const [fn, once] = listeners[i]
			try {
				fn(data)
			} catch (err) {
				this.#log(`unhandled listener exception: ${err.message}`)
			}
			if (once) listeners.splice(i, 1)
		}
	}

	async handshakeIncoming(localUsername: string): Promise<string> {
		await this.#waitOpen()
		return new Promise((accept, reject) => {
			const timeout = setTimeout(() => {
				this.off('hello', onHello)
				this.#conn.close()
				this.#log('handshake failed: timeout')
				reject(new PeerError('handshake failed: timeout'))
			}, TIMEOUT_MS)

			const onHello = (data: PeerHelloPacket) => {
				this.#log(`received hello from ${data.username}`)
				clearTimeout(timeout)

				this.send({type: 'helloAck', username: localUsername})
					.then(() => accept(this.#username = data.username))
					.catch(reject)
			}
			this.once('hello', onHello)

			// start receiving packets only **after** we setup the listener
			this.#startReceive()
		})
	}

	async handshakeOutgoing(localUsername: string): Promise<string> {
		await this.#waitOpen()
		return new Promise<string>((accept, reject) => {
			const timeout = setTimeout(() => {
				this.off('helloAck', onAck)
				this.#conn.off('error', onError)
				this.#conn.close()
				this.#log('handshake failed: timeout')
				reject(new PeerError('handshake failed: timeout'))
			}, TIMEOUT_MS)

			const onAck = (data: PeerHelloAckPacket) => {
				this.#log(`received hello ack from ${data.username}`)
				clearTimeout(timeout)
				this.#conn.off('error', onError)
				accept(this.#username = data.username)
			}
			this.once('helloAck', onAck)

			const onError = (err: Error) => {
				clearTimeout(timeout)
				this.off('helloAck', onAck)
				reject(err)
			}
			this.#conn.once('error', onError)

			// start receiving packets only **after** we setup the listener
			this.#startReceive()

			this.send({type: 'hello', username: localUsername}).catch(reject)
		})
	}

	#waitOpen(): Promise<void> {
		return new Promise<void>((accept, reject) => {
			if (this.#conn.open) {
				accept()
				return
			}

			const onOpen = () => {
				clearTimeout(timeout)
				accept()
			}

			const timeout = setTimeout(() => {
				this.#conn.off('open', onOpen)
				reject(new PeerError('failed opening connection, timeout'))
			}, TIMEOUT_MS)

			this.#conn.once('open', onOpen)
		})
	}

	#startReceive() {
		this.#conn.on('data', (data: PeerPacket) => {
			if (!('type' in data))
				return

			this.#log(`received '${data.type}' packet`)
			this.#emit(data)
		})
	}

	async sendMessage(text: string, time: number) {
		const ackId = Math.floor(Math.random() * 4294967296)

		const promise = new Promise<void>((accept, reject) => {
			const timeout = setTimeout(() => {
				this.off('msgAck', onAck)
				reject(new PeerError(`failed sending message ${ackId} to ${this.peerId}, timeout`))
			}, 5000)

			const onAck = (data: PeerMessageAckPacket) => {
				if (data.ackId !== ackId)
					return

				clearTimeout(timeout)
				this.off('msgAck', onAck)
				accept()
			}
			this.on('msgAck', onAck)
		})
		await this.send({type: 'msg', text, time, ackId})
		return await promise
	}

	#log(msg: string): void {
		console.log('[P2P]', `[${this.#conn.peer}]`, msg)
	}

	async send(packet: PeerPacket, chunked = false): Promise<void> {
		return new Promise((accept) => {
			this.#log(`sending '${packet.type}' packet, open: ${this.#conn.open}`)
			this.#conn.send(packet, chunked)
			accept()
		})
	}

	close() {
		this.#conn.close()
		for (const listeners of Object.values(this.#listeners))
			listeners.length = 0
	}

	get username(): string {
		return this.#username
	}

	get peerId(): string {
		return this.#conn.peer
	}
}

class PeerManager {
	readonly #conns: { [key: string]: ConnManager } = {}
	readonly #connectToErrors: { [key: string]: (err: Error) => void } = {}
	#peer: Peer
	#id: string
	#username: string
	#onmessage: OnMessageListener
	#onpeer: OnPeerListener

	#log(msg: string): void {
		console.log('[P2P]', msg)
	}

	async init(id: string, username: string, onmessage: OnMessageListener, onpeer: OnPeerListener) {
		this.#id = id
		this.#username = username
		this.#onmessage = onmessage
		this.#onpeer = onpeer
		this.#peer = new Peer(`yasma_${id}`, {debug: 2})
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

		this.#peer.on('error', err => {
			// hackish way to detect a Peer#connect(string) call failing
			if ('type' in err && err.type === 'peer-unavailable') {
				const match = err.message.match(/^Could not connect to peer (yasma_.*)$/)
				if (match && this.#connectToErrors[match[1]])
					setTimeout(this.#connectToErrors[match[1]].bind(this, err), 0)
			}
		})
	}

	#handleConnection(conn: DataConnection) {
		this.#log(`incoming connection: ${conn.peer}`)

		// TODO: check if peer already connected (?)

		const connManager = new ConnManager(conn, this.#onmessage)
		this.#conns[conn.peer] = connManager
		connManager.handshakeIncoming(this.#username)
			.then(username => this.#onpeer(conn.peer, username))
			.catch(err => {
				this.#log(`failed incoming handshake from ${conn.peer}: ${err.message}`)
			})
	}

	async connectTo(peer: string): Promise<string> {
		if (!this.#peer)
			throw new PeerError('peer not ready')
		if (!peer.startsWith('yasma_'))
			throw new PeerError('invalid peer id')

		// TODO: check if peer already connected (?)

		const connManager = new ConnManager(this.#peer.connect(peer), this.#onmessage)
		this.#conns[peer] = connManager
		const username = await connManager.handshakeOutgoing(this.#username)
		await this.#onpeer(peer, username)
		return username
	}

	async sendMessage(peer: string, text: string, time: number) {
		const conn = this.#conns[peer]
		if (!conn) {
			// TODO: try to connect
			throw new PeerError('unknown peer')
		}

		return await conn.sendMessage(text, time)
	}

	get peer(): string {
		if (!this.#peer)
			throw new PeerError('peer not ready')

		return this.#id
	}

	deinit() {
		for (const conn of Object.values(this.#conns)) conn.close()
		this.#peer.destroy()
	}
}


const manager = new PeerManager()
export default manager
