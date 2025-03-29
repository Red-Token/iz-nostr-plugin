import {ipcMain, BrowserWindow, BrowserWindowConstructorOptions} from 'electron'
import {getPublicKey, validateEvent, finalizeEvent} from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import * as nip04 from 'nostr-tools/nip04'
import * as nip44 from 'nostr-tools/nip44'
import {Mutex} from 'async-mutex'
import {LRUCache} from './utils'
import {join, dirname} from 'path'
import * as fs from 'fs'
import * as path from 'path'
import {fileURLToPath} from 'url'
import {getStorage} from './storage'
import {
	NO_PERMISSIONS_REQUIRED,
	getPermissionStatus,
	updatePermission,
	showNotification,
	getPosition
} from './common'

// Get the current directory path for ESM module
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Global variables for handlers
const width = 440
const height = 420

let openPrompt: BrowserWindow | null = null
let promptMutex = new Mutex()
let releasePromptMutex = () => {}
let secretsCache = new LRUCache(100)
let previousSk: string | null = null

// Basic types for messages
interface ExtensionMessage {
	type?: string
	params?: any
	host?: string
}

interface PromptMessage {
	host: string
	type: string
	accept: boolean
	conditions?: any
}

// Function to get shared secret for encryption
function getSharedSecret(sk: string, peer: string): any {
	if (previousSk !== sk) {
		secretsCache.clear()
		previousSk = sk
	}

	let key = secretsCache.get(peer)

	if (!key) {
		// Convert string to Uint8Array for nostr-tools
		const skBytes = new TextEncoder().encode(sk)
		const peerBytes = new TextEncoder().encode(peer)
		// @ts-ignore - and ignore type mismatch
		key = nip44.utils.getConversationKey(skBytes, peerBytes)
		secretsCache.set(peer, key)
	}

	return key
}

// Function for handling messages from web pages
async function handleContentScriptMessage({type, params, host}: ExtensionMessage) {
	if (!type || !host) return {error: {message: 'missing required parameters'}}

	if (NO_PERMISSIONS_REQUIRED[type]) {
		switch (type) {
			case 'replaceURL': {
				const protocolHandler = (await getStorage('protocol_handler')) as string
				if (!protocolHandler) return false

				const {url} = params
				const raw = url.split('nostr:')[1]
				const decoded = nip19.decode(raw)

				if (typeof decoded === 'string' || !('type' in decoded)) {
					return false
				}

				const {type: nipType, data} = decoded as any
				// Typed keys for security
				type NipTypes = 'npub' | 'note' | 'nprofile' | 'nevent' | 'naddr' | 'nsec' | 'nrelay'
				const p_or_e: Record<NipTypes, string | null> = {
					npub: 'p',
					note: 'e',
					nprofile: 'p',
					nevent: 'e',
					naddr: 'a',
					nsec: 's',
					nrelay: 'r'
				}
				const u_or_n: Record<NipTypes, string | null> = {
					npub: 'u',
					note: 'n',
					nprofile: 'u',
					nevent: 'n',
					naddr: 'a',
					nsec: 's',
					nrelay: 'r'
				}

				const replacements: Record<string, string | null> = {
					raw,
					hrp: nipType,
					hex: typeof data === 'string' ? data : null,
					p_or_e: p_or_e[nipType as NipTypes] || null,
					u_or_n: u_or_n[nipType as NipTypes] || null,
					relay0: null,
					relay1: null,
					relay2: null
				}

				if (nipType === 'nprofile' && typeof data === 'object' && 'relays' in data) {
					const relays = (data as any).relays || []
					replacements.relay0 = relays[0] || null
					replacements.relay1 = relays[1] || null
					replacements.relay2 = relays[2] || null
				}

				let result = protocolHandler
				Object.entries(replacements).forEach(([pattern, value]) => {
					result = result.replace(new RegExp(`{ *${pattern} *}`, 'g'), value || '')
				})

				return result
			}
		}
		return
	} else {
		releasePromptMutex = await promptMutex.acquire()
		const finalResult = await performOperation(type, params)

		// If the operation already returned an error (e.g., missing key), return it immediately
		if (
			finalResult &&
			typeof finalResult === 'object' &&
			'error' in finalResult &&
			finalResult.error
		) {
			releasePromptMutex()
			return finalResult
		}

		let allowed = await getPermissionStatus(
			host,
			type,
			type === 'signEvent' ? params.event : undefined
		)

		if (allowed === true) {
			releasePromptMutex()
			showNotification(host, allowed, type, params)
			return finalResult
		} else if (allowed === false) {
			releasePromptMutex()
			showNotification(host, allowed, type, params)
			return {
				error: {message: 'denied'}
			}
		} else {
			try {
				let id = Math.random().toString().slice(4)

				// Show confirmation window
				const accept = await openPromptWindow(
					host,
					id,
					params,
					type,
					typeof finalResult === 'string' ? finalResult : null
				)

				releasePromptMutex()
				if (!accept) return {error: {message: 'denied'}}

				return finalResult
			} catch (err: unknown) {
				releasePromptMutex()
				const error = err as Error
				return {
					error: {message: error.message, stack: error.stack}
				}
			}
		}
	}
}

// Function for performing nostr operations
async function performOperation(type: string, params: any) {
	const privateKey = await getStorage('private_key')

	if (!privateKey || privateKey === '') {
		openOptionsWindow()
		console.log('key not found : ', privateKey)
		return {error: {message: 'no private key found'}}
	}
	try {
		switch (type) {
			case 'getPublicKey': {
				// @ts-ignore - and ignore type mismatch
				return getPublicKey(privateKey)
			}
			case 'signEvent': {
				// @ts-ignore - and ignore type mismatch
				const event = finalizeEvent(params.event, privateKey)
				// @ts-ignore - and ignore type mismatch
				return validateEvent(event) ? event : {error: {message: 'invalid event'}}
			}
			case 'nip04.encrypt': {
				let {peer, plaintext} = params as {peer: string, plaintext: string}
				// @ts-ignore - and ignore type mismatch
				return nip04.encrypt(privateKey, peer, plaintext)
			}
			case 'nip04.decrypt': {
				let {peer, ciphertext} = params as {peer: string, ciphertext: string}
				// @ts-ignore - and ignore type mismatch
				return nip04.decrypt(privateKey, peer, ciphertext)
			}
			case 'nip44.encrypt': {
				const {peer, plaintext} = params as {peer: string, plaintext: string}
				// @ts-ignore - and ignore type mismatch
				const key = getSharedSecret(privateKey, peer)
				return nip44.encrypt(plaintext, key)
			}
			case 'nip44.decrypt': {
				const {peer, ciphertext} = params as {peer: string, ciphertext: string}
				// @ts-ignore - and ignore type mismatch
				const key = getSharedSecret(privateKey, peer)
				return nip44.decrypt(ciphertext, key)
			}
			case 'nip19.npubEncode': {
				// @ts-ignore - and ignore type mismatch
				return nip19.npubEncode(params.pubkey)
			}
			case 'nip19.nsecEncode': {
				// @ts-ignore - and ignore type mismatch
				return nip19.nsecEncode(params.privkey)
			}
			case 'nip19.decode': {
				// @ts-ignore - and ignore type mismatch
				return nip19.decode(params.nip19)
			}
			case 'getRelays': {
				const relays = await getStorage('relays')
				return relays || {}
			}
		}
	} catch (error: unknown) {
		const err = error as Error
		return {error: {message: err.message, stack: err.stack}}
	}
}

// Function for handling messages from the confirmation window
async function handlePromptMessage({host, type, accept, conditions}: PromptMessage, sender: any) {
	// update policies
	if (conditions) {
		await updatePermission(host, type, accept, conditions)
	}

	// cleanup
	openPrompt = null

	// release mutex after updating policies
	releasePromptMutex()
}

// Function to open settings window
export async function openOptionsWindow() {
	const {top, left} = await getPosition(width, height)

	const windowOptions: BrowserWindowConstructorOptions = {
		width,
		height,
		x: left,
		y: top,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			webSecurity: false
		}
	}

	const optionsWindow = new BrowserWindow(windowOptions)
	const optionsPath = join(__dirname, 'options.html')
	console.log('[nos2x] Loading options from:', optionsPath)
	optionsWindow.loadFile(optionsPath)
	return optionsWindow
}

// Function to open confirmation window
async function openPromptWindow(
	host: string,
	id: string,
	params: any,
	type: string,
	finalResult: string | null
) {
	try {
		const searchParams = new URLSearchParams()
		searchParams.set('host', host)
		searchParams.set('id', id)
		searchParams.set('params', JSON.stringify(params))
		searchParams.set('type', type)

		if (typeof finalResult === 'string') {
			searchParams.set('result', finalResult)
		}

		const {top, left} = await getPosition(width, height)
		let accept = await new Promise<boolean>(resolve => {
			// Close existing window if it's already open
			if (openPrompt && !openPrompt.isDestroyed()) {
				openPrompt.close()
			}

			const windowOptions: BrowserWindowConstructorOptions = {
				width,
				height,
				x: left,
				y: top,
				webPreferences: {
					nodeIntegration: true,
					contextIsolation: false,
					webSecurity: false
				}
			}

			openPrompt = new BrowserWindow(windowOptions)

			// Open options window instead of prompt file if we don't have a private key
			const hasPrivateKey = getStorage('private_key')
			if (!hasPrivateKey) {
				console.log('[nos2x] No private key found, opening options window')
				const optionsPath = join(__dirname, 'options.html')
				openPrompt.loadFile(optionsPath)

				// Track settings window closure
				openPrompt.on('closed', () => {
					// Check if a key was set
					const newPrivateKey = getStorage('private_key')
					if (newPrivateKey) {
						// If key was set, reopen the permission request window
						console.log('[nos2x] Private key was set, reopening prompt window')
						setTimeout(() => {
							openPromptWindow(host, id, params, type, finalResult)
								.then(result => resolve(result))
								.catch(() => resolve(false))
						}, 500) // Small delay to complete closing
					} else {
						resolve(false) // If the key was not set, reject the request
					}
				})
			} else {
				// For prompt.html use the correct path to load the file
				const promptPath = join(__dirname, 'prompt.html')
				console.log('[nos2x] Loading prompt from:', promptPath)

				// Create URL with properly formatted parameters
				openPrompt.loadURL(`file://${promptPath}?${searchParams.toString()}`)
			}

			// Handler for receiving response from confirmation window
			openPrompt.webContents.on('ipc-message', (event, channel, data) => {
				if (channel === 'prompt-response') {
					resolve(data.accept)
					if (openPrompt && !openPrompt.isDestroyed()) {
						openPrompt.close()
					}
				}
			})

			// Handler for window closure without response
			openPrompt.on('closed', () => {
				// If window is closed without response (via X button), reject the request
				if (openPrompt) {
					openPrompt = null
					resolve(false)
				}
			})
		})

		return accept
	} catch (err: unknown) {
		const error = err as Error
		console.error('[nos2x] Error opening prompt window:', error)
		return false
	}
}

// Export initialization function to work as an ESM module
export function initBackgroundProcess() {
	console.log('[nos2x] Background process initialized')

	// Handler for opening settings window
	ipcMain.on('open-options', () => {
		openOptionsWindow()
	})

	// Handler for responses from prompt.jsx
	ipcMain.on('prompt-response', (event, message) => {
		const {accept, id, host, type, conditions} = message
		handlePromptMessage(
			{
				host,
				type,
				accept,
				conditions: conditions || {}
			},
			event.sender
		)
	})

	// Handler for messages from web pages
	ipcMain.handle('external-message', async (_, message) => {
		return handleContentScriptMessage(message)
	})

	// Get content-script for injection
	ipcMain.handle('get-nostr-provider-content', () => {
		try {
			const scriptPath = path.join(__dirname, 'nostr-provider.js')
			console.log('[nos2x] Looking for script at:', scriptPath)
			if (fs.existsSync(scriptPath)) {
				const content = fs.readFileSync(scriptPath, 'utf8')
				return content
			} else {
				throw new Error(`File not found: ${scriptPath}`)
			}
		} catch (error) {
			console.error('[nos2x] Error reading nostr-provider.js:', error)
			throw error
		}
	})
}
