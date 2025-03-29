// Cannot import types here because the file will be injected into the web page
// and doesn't have access to node_modules

// Declare global interface Window for TypeScript
interface Window {
	nostr?: NostrAPI
	electronAPI?: any
}
// Interface for Nostr events
interface NostrEvent {
	id?: string
	pubkey?: string
	created_at: number
	kind: number
	tags: string[][]
	content: string
	sig?: string
}

// Interface for window.nostr API
interface NostrAPI {
	getPublicKey(): Promise<string>
	signEvent(event: NostrEvent): Promise<NostrEvent>
	getRelays?(): Promise<Record<string, {read: boolean; write: boolean}>>
	nip04: {
		encrypt(pubkey: string, plaintext: string): Promise<string>
		decrypt(pubkey: string, ciphertext: string): Promise<string>
	}
	nip44?: {
		encrypt(pubkey: string, plaintext: string): Promise<string>
		decrypt(pubkey: string, ciphertext: string): Promise<string>
	}
}

// Create a unique identifier for messages
function generateId(): string {
	return Math.random().toString().slice(-4)
}

const pendingCallbacks: Record<string, (response: any) => void> = {}

// Send message to content-script and wait for response
function sendMessage(type: string, params: any): Promise<any> {
	// Create a promise that will be resolved with the response
	return new Promise(resolve => {
		const id = generateId()
		pendingCallbacks[id] = resolve

		// Send message to content-script
		window.postMessage(
			{
				id,
				ext: 'nos2x',
				type,
				params
			},
			'*'
		)
	})
}

// Listen for responses from content-script
window.addEventListener('message', event => {
	if (event.source !== window) return
	if (!event.data) return
	if (!event.data.response) return
	if (event.data.ext !== 'nos2x') return

	const id = event.data.id
	if (pendingCallbacks[id]) {
		const callback = pendingCallbacks[id]
		delete pendingCallbacks[id]
		callback(event.data.response)
	}
})
// Implement window.nostr API
const nostr: NostrAPI = {
	getPublicKey: async () => {
		return await sendMessage('getPublicKey', {})
	},

	signEvent: async event => {
		return await sendMessage('signEvent', {event})
	},

	getRelays: async () => {
		return await sendMessage('getRelays', {})
	},

	nip04: {
		encrypt: async (pubkey, plaintext) => {
			return await sendMessage('nip04.encrypt', {peer: pubkey, plaintext})
		},
		decrypt: async (pubkey, ciphertext) => {
			return await sendMessage('nip04.decrypt', {peer: pubkey, ciphertext})
		}
	},

	nip44: {
		encrypt: async (pubkey, plaintext) => {
			return await sendMessage('nip44.encrypt', {peer: pubkey, plaintext})
		},
		decrypt: async (pubkey, ciphertext) => {
			return await sendMessage('nip44.decrypt', {peer: pubkey, ciphertext})
		}
	}
}

// Add window.nostr
window.nostr = nostr

// Declare to the outside world that nos2x is ready
window.dispatchEvent(new Event('nos2x-ready'))

console.log('nos2x provider injected successfully')
