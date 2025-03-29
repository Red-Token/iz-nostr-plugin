import {ipcRenderer} from 'electron'

/**
 * Get value from storage
 * @param key Key or array of keys
 * @returns Value or object of values
 */
export const getStorage = async (key: string | string[]) => {
	console.log('[nos2x-renderer] Getting storage key:', key)
	return ipcRenderer.invoke('storage-get', key)
}

/**
 * Save value to storage
 * @param key Key or object of key-value pairs
 * @param value Value (if key is a string)
 * @returns true on successful save
 */
export const setStorage = async (key: string | Record<string, any>, value?: any) => {
	if (typeof key === 'string') {
		console.log('[nos2x-renderer] Setting storage key:', key)
		return ipcRenderer.invoke('storage-set', key, value)
	} else {
		console.log('[nos2x-renderer] Setting multiple storage keys')
		return ipcRenderer.invoke('storage-set', key)
	}
}

/**
 * Remove value from storage
 * @param key Key to remove
 * @returns true on successful removal
 */
export const removeStorage = async (key: string) => {
	console.log('[nos2x-renderer] Removing storage key:', key)
	return ipcRenderer.invoke('storage-remove', key)
}
