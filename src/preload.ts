import {contextBridge, ipcRenderer, IpcRendererEvent} from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
	sendToMain: <T>(channel: string, data: any): Promise<T> => {
		return ipcRenderer.invoke(channel, data)
	},
	onFromMain: (channel: string, callback: (...args: any[]) => void) => {
		ipcRenderer.on(channel, (event: IpcRendererEvent, ...args: any[]) => callback(...args))
		return () => ipcRenderer.removeAllListeners(channel)
	}
})

interface NostrEvent {
	id?: string
	pubkey?: string
	created_at: number
	kind: number
	tags: string[][]
	content: string
	sig?: string
}

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

declare global {
	interface Window {
		nostr?: NostrAPI
	}
}

window.addEventListener('DOMContentLoaded', () => {
	contextBridge.exposeInMainWorld('nostr', {
		_pubkey: null,
		getPublicKey: async function () {
			if (this._pubkey) return this._pubkey
			this._pubkey = await ipcRenderer.invoke('external-message', {
				type: 'getPublicKey',
				params: {},
				host: window.location.host
			})
			return this._pubkey
		},
		signEvent: async (event: any) => {
			return ipcRenderer.invoke('external-message', {
				type: 'signEvent',
				params: {event},
				host: window.location.host
			})
		},
		getRelays: async () => ({}),
		nip04: {
			encrypt: (peer: string, plaintext: string) =>
				ipcRenderer.invoke('external-message', {
					type: 'nip04.encrypt',
					params: {peer, plaintext},
					host: window.location.host
				}),
			decrypt: (peer: string, ciphertext: string) =>
				ipcRenderer.invoke('external-message', {
					type: 'nip04.decrypt',
					params: {peer, ciphertext},
					host: window.location.host
				})
		},
		nip44: {
			encrypt: (peer: string, plaintext: string) =>
				ipcRenderer.invoke('external-message', {
					type: 'nip44.encrypt',
					params: {peer, plaintext},
					host: window.location.host
				}),
			decrypt: (peer: string, ciphertext: string) =>
				ipcRenderer.invoke('external-message', {
					type: 'nip44.decrypt',
					params: {peer, ciphertext},
					host: window.location.host
				})
		}
	})
})
