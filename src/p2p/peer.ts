import {DataConnection, Peer} from 'peerjs'
import {PeerPacket} from '../types'

class PeerError extends Error {
	constructor(msg: string)
	constructor(conn: DataConnection, msg: string)
	constructor(msgOrConn: DataConnection | string, msg?: string) {
		if (typeof msgOrConn == 'string') super(msgOrConn)
		else super(`[${msgOrConn.peer}] ${msg}`)
	}
}

class PeerManager {
	readonly #conns: { [key: string]: DataConnection } = {}
	#peer: Peer
	#id: string
	#username: string
	#onmessage: (peer: string, text: string) => Promise<void>

	#log(msg: string): void
	#log(conn: DataConnection, msg: string): void
	#log(msgOrConn: DataConnection | string, msg?: string): void {
		if (typeof msgOrConn == 'string') console.log('[P2P]', msgOrConn)
		else console.log('[P2P]', `[${msgOrConn.peer}]`, msg)
	}

	async init(id: string, username: string) {
		this.#id = id
		this.#username = username
		this.#peer = new Peer(`yasma_${id}`, {debug: 2})
		this.#peer.on('connection', this.#handleConnection, this)
		return new Promise<void>((accept, reject) => {
			this.#peer.on('open', () => {
				this.#log(`initialized peer: ${id} (${username})`)
				accept()
			}, this)
			this.#peer.on('error', () => {
				reject(new PeerError(`failed initializing peer: ${id} (${username})`))
			}, this)
		})
	}

	async #handleConnection(conn: DataConnection) {
		this.#log(conn, 'received connection')

		const disconnectTimeout = setTimeout(() => {
			if (!conn.open)
				return

			conn.close()
			this.#log(conn, 'terminated connection for timeout')
		}, 5000)

		conn.once('data', (data: PeerPacket) => {
			if (data.type !== 'hello') {
				conn.close()
				this.#log(conn, 'terminated connection for invalid packet')
				return
			}

			this.#log(conn, `received hello packet: ${data.username}`)
			conn.send({type: 'helloAck', username: this.#username})

			clearTimeout(disconnectTimeout)
			conn.on('data', this.#handleData.bind(this, conn), this)
			conn.on('error', () => {
				// TODO
			})
		})
	}

	async #handleData(conn: DataConnection, data: PeerPacket) {
		this.#log(conn, `received ${data.type} packet`)

		if (data.type == 'msg') {
			if (this.#onmessage) await this.#onmessage(conn.peer, data.text)
		}
	}

	set onmessage(callback: (peer: string, text: string) => Promise<void>) {
		this.#onmessage = callback
	}

	async connectTo(id: string): Promise<[string, string]> {
		if (!this.#peer)
			throw new PeerError('peer not ready')

		const conn = this.#peer.connect(id)
		return new Promise((accept, reject) => {
			conn.once('data', (data: PeerPacket) => {
				if (data.type !== 'helloAck') {
					reject(new PeerError(conn, 'invalid packet'))
					return
				}

				this.#log(conn, `received hello ack packet: ${data.username}`)
				this.#conns[id] = conn
				accept([conn.peer, data.username])
			})

			conn.once('open', () => {
				conn.send({type: 'hello', username: this.#username})
				this.#log(conn, 'sent hello packet')
			})
		})
	}

	sendMessage(peer: string, text: string) {
		const conn = this.#conns[peer]
		if (!conn)
			throw new PeerError(`unknown peer: ${peer}`)

		conn.send({type: 'msg', text})
		// TODO: ack
	}
}


const manager = new PeerManager()
export default manager
