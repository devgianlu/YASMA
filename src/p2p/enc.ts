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

export const deriveSymmetricKey = async (passphrase: string, salt: string): Promise<CryptoKey> => {
	const rawKey = await window.crypto.subtle.importKey('raw', textToBuffer(passphrase), 'PBKDF2', false, ['deriveBits', 'deriveKey'])
	return await window.crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt: textToBuffer(salt),
			iterations: 100000,
			hash: 'SHA-256',
		},
		rawKey,
		{name: 'AES-CBC', length: 256},
		true,
		['encrypt', 'decrypt'],
	)
}

export const encryptSymmetric = async (key: CryptoKey, data: string) => {
	const iv = new Uint8Array(16)
	await window.crypto.getRandomValues(iv)
	const encrypted = bufferToBase64(await window.crypto.subtle.encrypt({name: 'AES-CBC', iv}, key, textToBuffer(data)))
	return bufferToBase64(iv) + ';' + encrypted
}

export const decryptSymmetric = async (key: CryptoKey, data: string) => {
	const [iv, encrypted] = data.split(';')
	return bufferToText(await window.crypto.subtle.decrypt({name: 'AES-CBC', iv: base64ToBuffer(iv)}, key, base64ToBuffer(encrypted)))
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

const bufferToText = (buffer: ArrayBuffer) => {
	return new TextDecoder().decode(buffer)
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