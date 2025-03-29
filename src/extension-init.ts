import {app, protocol, BrowserWindow, ProtocolResponse, ProtocolRequest} from 'electron'
import * as path from 'path'
import {fileURLToPath, pathToFileURL} from 'url'
import fs from 'fs'

// Get the current directory for __dirname in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface InitializeOptions {
	extensionPath?: string
	debug?: boolean
}

interface ExtensionMethods {
	getPreloadPath: () => string
	openOptions: () => Promise<BrowserWindow>
	getPublicKeyOrShowOptions: () => Promise<BrowserWindow>
	openPopup: () => BrowserWindow
}

export function initializeExtension(options: InitializeOptions = {}): ExtensionMethods {
	// Get the absolute path to the extension directory
	let extensionPath = options.extensionPath ?? __dirname
	if (!path.isAbsolute(extensionPath)) {
		extensionPath = path.resolve(__dirname, extensionPath)
	}

	const debug = options.debug || false
	const log = debug ? console.log : (...args: any[]) => {}

	let backgroundModule: any = null

	const registerProtocol = () => {
		if (!protocol.isProtocolRegistered('extension')) {
			protocol.registerFileProtocol(
				'extension',
				(request: ProtocolRequest, callback: (response: ProtocolResponse) => void) => {
					const url = request.url.substring(11) // remove 'extension://'
					const filePath = path.join(extensionPath, url)
					log(`[nos2x] Loading: ${filePath}`)
					callback({path: filePath})
				}
			)
			log('[nos2x] Protocol registered')
		}
	}

	const loadBackground = async () => {
		try {
			const backgroundPath = path.join(extensionPath, 'background.js')
			log(`[nos2x] Loading background from: ${backgroundPath}`)

			if (!fs.existsSync(backgroundPath)) {
				throw new Error(`Background file not found at ${backgroundPath}`)
			}

			const backgroundUrl = pathToFileURL(backgroundPath).href
			log(`[nos2x] Loading background from URL: ${backgroundUrl}`)

			backgroundModule = await import(backgroundUrl)

			if (typeof backgroundModule.initBackgroundProcess === 'function') {
				backgroundModule.initBackgroundProcess()
			}
		} catch (err) {
			console.error('[nos2x] Failed to load background process:', err)
		}
	}

	const initializeApp = () => {
		registerProtocol()
		loadBackground().catch(err => {
			console.error('[nos2x] Initialization error:', err)
		})
	}

	log('[nos2x] Initializing extension...')
	log(`[nos2x] Extension path: ${extensionPath}`)

	if (app.isReady()) {
		initializeApp()
	} else {
		app.whenReady().then(initializeApp)
	}

	log('[nos2x] Extension initialized successfully')

	return {
		getPreloadPath: () => path.join(extensionPath, 'preload.js'),

		openOptions: async () => {
			if (backgroundModule?.openOptionsWindow instanceof Function) {
				return backgroundModule.openOptionsWindow()
			}
			const optionsWindow = new BrowserWindow({
				width: 800,
				height: 600,
				webPreferences: {
					nodeIntegration: true,
					contextIsolation: false
				}
			})
			await optionsWindow.loadFile(path.join(extensionPath, 'options.html'))
			return optionsWindow
		},

		getPublicKeyOrShowOptions: async () => {
			if (backgroundModule?.getPublicKeyOrShowOptions instanceof Function) {
				return backgroundModule.getPublicKeyOrShowOptions()
			}
			const optionsWindow = new BrowserWindow({
				width: 800,
				height: 600,
				webPreferences: {
					nodeIntegration: true,
					contextIsolation: true
				}
			})
			await optionsWindow.loadFile(path.join(extensionPath, 'options.html'))
			return optionsWindow
		},

		openPopup: () => {
			const popupWindow = new BrowserWindow({
				width: 400,
				height: 600,
				webPreferences: {
					nodeIntegration: true,
					contextIsolation: true
				}
			})
			popupWindow.loadFile(path.join(extensionPath, 'popup.html'))
			return popupWindow
		}
	}
}
