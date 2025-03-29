import {ipcMain, app} from 'electron'
import Store from 'electron-store'
import * as path from 'path'

// Create storage only in the main process
const store = new Store({
	name: 'nos2x-settings',
	// Use the standard userData directory
	// Do not use import.meta.url as it does not work in IIFE format
	defaults: {
		private_key: null,
		policies: {},
		protocol_haАndler: null,
		notifications: true
	}
})

// Handle storage operations
ipcMain.handle('storage-get', (_, key: string) => {
	console.log('[nos2x] Getting storage key:', key)
	return store.get(key)
})

ipcMain.handle('storage-set', (_, key: string, value: any) => {
	console.log('[nos2x] Setting storage key:', key)
	store.set(key, value)
})

ipcMain.handle('storage-remove', (_, key: any) => {
	console.log('[nos2x] Removing storage key:', key)
	store.delete(key)
})

// For the main process, use direct access to the store
// For the renderer process, we will use storage-renderer.ts
export const getStorage = (key: string) => {
	console.log('[nos2x] Getting storage key directly:', key)
	return store.get(key)
}

export const setStorage = (key: string, value: any) => {
	console.log('[nos2x] Setting storage key directly:', key)
	store.set(key, value)
	return true
}

export const removeStorage = (key: string) => {
	console.log('[nos2x] Removing storage key directly:', key)
	store.delete(key)
	return true
}
