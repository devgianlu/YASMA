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
	readonly #conns: { [key: string]: [DataConnection, string] } = {}
	readonly #connectToErrors: { [key: string]: (err: Error) => void } = {}
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
			// hackish way to recover a Peer#connect(string) call failing
			if ('type' in err && err.type === 'peer-unavailable') {
				const match = err.message.match(/^Could not connect to peer (yasma_.*)$/)
				if (match && this.#connectToErrors[match[1]])
					setTimeout(this.#connectToErrors[match[1]].bind(this, err), 0)
			}
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

	async connectTo(id: string, reconnect = false): Promise<[string, string]> {
		if (!this.#peer)
			throw new PeerError('peer not ready')
		if (!id.startsWith('yasma_'))
			throw new PeerError('invalid peer id')

		// Try to reuse a previously connected DataConnection
		// There is a small race condition here if #connectTo is called again before the connection is complete...
		if (this.#conns[id]) {
			const [conn, username] = this.#conns[id]
			if (conn.peer !== id)
				throw new PeerError('invalid connection with wrong peer')

			if (reconnect) {
				// Reconnecting, discard connection and continue
				conn.close()
				delete this.#conns[id]
			} else if (conn.open) {
				// Not reconnecting and connection open, sounds good!
				return [id, username]
			} else {
				// Just remove it and continue
				delete this.#conns[id]
			}
		}

		const conn = this.#peer.connect(id)
		return new Promise<[string, string]>((accept, reject) => {
			this.#connectToErrors[id] = err => {
				delete this.#connectToErrors[id]
				reject(err)
			}

			conn.once('data', (data: PeerPacket) => {
				if (data.type !== 'helloAck') {
					reject(new PeerError(conn, 'invalid packet'))
					return
				}

				this.#log(conn, `received hello ack packet: ${data.username}`)
				this.#conns[id] = [conn, data.username]
				delete this.#connectToErrors[id]
				accept([conn.peer, data.username])
			})
			conn.once('error', err => {
				delete this.#connectToErrors[id]
				reject(err)
			})
			conn.once('open', () => {
				conn.send({type: 'hello', username: this.#username})
				this.#log(conn, 'sent hello packet')
			})
		})
	}

	async sendMessage(peer: string, text: string) {
		if (!this.#conns[peer])
			throw new PeerError(`unknown peer: ${peer}`)

		const [conn] = this.#conns[peer]
		conn.send({type: 'msg', text})
		// TODO: ack
	}

	get peer(): string {
		if (!this.#peer)
			throw new PeerError('peer not ready')

		return this.#id
	}
}


const manager = new PeerManager()
export default manager
