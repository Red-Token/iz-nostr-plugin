export function getPermissionStatus(host: any, type: any, event: any): Promise<boolean>

export function updatePermission(host: any, type: any, accept: any, conditions: any): Promise<void>

export function removePermissions(host: any, accept: any, type: any): Promise<void>

export function showNotification(host: any, answer: any, type: any, params: any): Promise<void>

export function getPosition(
    width: any,
    height: any
): Promise<{
    top: number
    left: number
}>

export const NO_PERMISSIONS_REQUIRED: {[key: string]: boolean}
export const PERMISSION_NAMES: any
