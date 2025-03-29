import {getStorage, setStorage} from './storage-renderer'

// Export constants that do not require permissions
export const NO_PERMISSIONS_REQUIRED: Record<string, boolean> = {
	replaceURL: true
}

// Export permissions that the extension can request
export const PERMISSION_NAMES: Record<string, string> = {
	getPublicKey: 'get your public key',
	signEvent: 'sign an event',
	'nip04.encrypt': 'encrypt a message for a recipient',
	'nip04.decrypt': 'decrypt a message from someone',
	'nip44.encrypt': 'encrypt a message for a recipient',
	'nip44.decrypt': 'decrypt a message from someone',
	'nip19.decode': 'decode something',
	'nip19.npubEncode': 'encode a public key',
	'nip19.nsecEncode': 'encode a secret key (it will never see the key)'
}

interface Conditions {
	kinds?: Record<number, boolean>
	// Other possible conditions
}

interface Policy {
	conditions: Conditions
	created_at: number
}

interface PoliciesType {
	[host: string]: {
		[accept: string]: {
			[type: string]: Policy
		}
	}
}

function matchConditions(conditions: Conditions | undefined, event: any): boolean {
	if (conditions?.kinds) {
		if (event.kind in conditions.kinds) return true
		else return false
	}

	return true
}

// Check permission status
export async function getPermissionStatus(
	host: string,
	type: string,
	event: any
): Promise<boolean | null> {
	if (!host || !type) return null

	const policies = ((await getStorage('policies')) || {}) as PoliciesType

	// Check if the policy already exists
	if (
		policies[host] &&
		((policies[host].true &&
			policies[host].true[type] &&
			checkConditions(policies[host].true[type].conditions, event)) ||
			(policies[host].false &&
				policies[host].false[type] &&
				checkConditions(policies[host].false[type].conditions, event)))
	) {
		return (
			policies[host].true &&
			policies[host].true[type] &&
			checkConditions(policies[host].true[type].conditions, event)
		)
	}

	return null
}

// Update permissions
export async function updatePermission(
	host: string,
	type: string,
	accept: boolean,
	conditions: any
): Promise<void> {
	if (!host || !type) return

	const policies = ((await getStorage('policies')) || {}) as PoliciesType
	const acceptStr = String(accept) // convert to 'true' or 'false'

	// ensure policies for this host exist
	if (!policies[host]) policies[host] = {}

	// ensure policies for this acceptance mode exist
	if (!policies[host][acceptStr]) policies[host][acceptStr] = {}

	// save this policy with conditions
	policies[host][acceptStr][type] = {
		conditions,
		created_at: Math.floor(Date.now() / 1000)
	}

	// update storage with modified policies
	await setStorage('policies', policies)
}

// Check conditions for permissions
function checkConditions(conditions: any, event: any): boolean {
	if (!conditions) return true
	if (!Object.keys(conditions).length) return true

	if (conditions.kinds && event?.kind !== undefined) {
		return !!conditions.kinds[event.kind]
	}

	return false
}

// Remove permissions
export async function removePermissions(host: string, accept: string, type: string): Promise<void> {
	const policies = ((await getStorage('policies')) || {}) as PoliciesType

	if (policies[host]?.[accept]?.[type]) {
		delete policies[host][accept][type]

		// Clear empty objects
		if (Object.keys(policies[host][accept]).length === 0) {
			delete policies[host][accept]
		}

		if (Object.keys(policies[host]).length === 0) {
			delete policies[host]
		}

		await setStorage('policies', policies)
	}
}

// Show notifications
export async function showNotification(
	host: string,
	allowed: boolean,
	type: string,
	params: any
): Promise<void> {
	const showNotifications = await getStorage('notifications')
	if (!showNotifications) return

	const title = allowed ? 'Access granted' : 'Access denied'
	const message = `${host} was ${allowed ? 'allowed' : 'denied'} to ${
		PERMISSION_NAMES[type] || type
	}.`

	// In Electron, we can use HTML5 Notifications instead of the browser API
	if ('Notification' in globalThis) {
		new Notification(title, {
			body: message,
			icon: '/icons/48.png'
		})
	}
}

// Get position for the window
export async function getPosition(
	width: number,
	height: number
): Promise<{left: number; top: number}> {
	// In Electron, we can use the screen module to get screen dimensions
	// Or simply center based on what we have
	const screenWidth = globalThis.innerWidth || 1024
	const screenHeight = globalThis.innerHeight || 768

	return {
		left: Math.floor(screenWidth / 2 - width / 2),
		top: Math.floor(screenHeight / 2 - height / 2)
	}
}