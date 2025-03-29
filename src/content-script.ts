import {ipcRenderer} from 'electron'

// Listen for messages from the injected script (nostr-provider.js)
window.addEventListener('message', async (event: MessageEvent) => {
	// Check that the message is from our window and has the required structure
	if (event.source !== window || !event.data || !event.data.params || event.data.ext !== 'nos2x') {
		return
	}

	console.log('[nos2x] Received message:', event.data.type)

	// Forward the message to the main process
	let response
	try {
		response = await ipcRenderer.invoke('external-message', {
			type: event.data.type,
			params: event.data.params,
			host: location.host || 'localhost'
		})
	} catch (error: any) {
		console.error('[nos2x] Error processing message:', error)
		response = {error: {message: error.message || 'Unknown error'}}
	}

	// Return the response
	window.postMessage(
		{
			id: event.data.id,
			ext: 'nos2x',
			response
		},
		'*'
	)
})
