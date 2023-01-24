export const generateMasterKey = async (): Promise<[JsonWebKey, JsonWebKey]> => {
	const masterKey = await window.crypto.subtle.generateKey({
		name: 'ECDSA',
		namedCurve: 'P-384'
	}, true, ['sign', 'verify'])
	return [
		await window.crypto.subtle.exportKey('jwk', masterKey.privateKey),
		await window.crypto.subtle.exportKey('jwk', masterKey.publicKey),
	]
}

const bufferToBase64 = (buffer: ArrayBuffer) => {
	let str = ''
	const bytes = new Uint8Array(buffer)
	for (let i = 0; i < bytes.byteLength; i++)
		str += String.fromCharCode(bytes[i])
	return window.btoa(str)
}

const base64ToBuffer = (data: string) => {
	const str = window.atob(data)
	const bytes = new Uint8Array(str.length)
	for (let i = 0; i < str.length; i++)
		bytes[i] = str.charCodeAt(i)
	return bytes.buffer
}

const textToBuffer = (text: string) => {
	return new TextEncoder().encode(text)
}

class EncryptionManager {
	#masterKey: CryptoKeyPair

	async setMasterKey(keyData: [JsonWebKey, JsonWebKey]) {
		this.#masterKey = {
			privateKey: await window.crypto.subtle.importKey('jwk', keyData[0], {
				name: 'ECDSA',
				namedCurve: 'P-384'
			}, true, ['sign']),
			publicKey: await window.crypto.subtle.importKey('jwk', keyData[1], {
				name: 'ECDSA',
				namedCurve: 'P-384'
			}, true, ['verify']),
		}
	}

	async verifyMessage(data: string, publicKeyData: JsonWebKey): Promise<string | null> {
		const [content, signature] = data.split(';')
		const publicKey = await window.crypto.subtle.importKey('jwk', publicKeyData, {
			name: 'ECDSA',
			namedCurve: 'P-384'
		}, true, ['verify'])

		if (!(await window.crypto.subtle.verify({
			name: 'ECDSA',
			hash: 'SHA-256'
		}, publicKey, base64ToBuffer(signature), base64ToBuffer(content)))) {
			return null
		}

		return window.atob(content)
	}

	async signMessage(content: string) {
		return window.btoa(content) + ';' + bufferToBase64(await window.crypto.subtle.sign(
			{name: 'ECDSA', hash: 'SHA-256'},
			this.#masterKey.privateKey,
			textToBuffer(content),
		))
	}

	async publicJwk(): Promise<JsonWebKey> {
		return await window.crypto.subtle.exportKey('jwk', this.#masterKey.publicKey)
	}
}

const manager = new EncryptionManager()
export default manager