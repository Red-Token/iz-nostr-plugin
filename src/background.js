import browser from 'webextension-polyfill'
import {sayHello} from './utils'
import {generateSecretKey} from 'nostr-tools/pure'
import {nip19} from 'nostr-tools'
import {NO_PERMISSIONS_REQUIRED, getPermissionStatus, showNotification, getPosition} from './explode/common'
browser.runtime.onInstalled.addListener(() => {
    console.log('Service Worker Loaded (TypeScript)!!!!')
    sayHello()
})
// Listen for messages from other parts of the extension (e.g., content scripts or popup)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message)
    sayHello()
    const key = generateSecretKey()
    console.log(nip19.nsecEncode(key))
    if (message.type === 'getPublicKey') {
        sendResponse('I am BOB!')
    }
    return true // Required if response is async
})
async function handleContentScriptMessage({type, params, host}) {
    if (NO_PERMISSIONS_REQUIRED[type]) {
        // authorized, and we won't do anything with private key here, so do a separate handler
        switch (type) {
            case 'replaceURL': {
                let {protocol_handler: ph} = await browser.storage.local.get(['protocol_handler'])
                if (!ph) return false
                let {url} = params
                let raw = url.split('nostr:')[1]
                let {type, data} = nip19.decode(raw)
                let replacements = {
                    raw,
                    hrp: type,
                    hex:
                        type === 'npub' || type === 'note'
                            ? data
                            : type === 'nprofile'
                              ? data.pubkey
                              : type === 'nevent'
                                ? data.id
                                : null,
                    p_or_e: {npub: 'p', note: 'e', nprofile: 'p', nevent: 'e'}[type],
                    u_or_n: {npub: 'u', note: 'n', nprofile: 'u', nevent: 'n'}[type],
                    relay0: type === 'nprofile' ? data.relays[0] : null,
                    relay1: type === 'nprofile' ? data.relays[1] : null,
                    relay2: type === 'nprofile' ? data.relays[2] : null
                }
                let result = ph
                Object.entries(replacements).forEach(([pattern, value]) => {
                    result = result.replace(new RegExp(`{ *${pattern} *}`, 'g'), value)
                })
                return result
            }
        }
        return
    } else {
        // acquire mutex here before reading policies
        releasePromptMutex = await promptMutex.acquire()
        // do the operation before asking (because we'll show the encryption/decryption results in the popup
        const finalResult = await performOperation(type, params)
        let allowed = await getPermissionStatus(host, type, type === 'signEvent' ? params.event : undefined)
        if (allowed === true) {
            // authorized, proceed
            releasePromptMutex()
            showNotification(host, allowed, type, params)
        } else if (allowed === false) {
            // denied, just refuse immediately
            releasePromptMutex()
            showNotification(host, allowed, type, params)
            return {
                error: {message: 'denied'}
            }
        } else {
            // ask for authorization
            try {
                let id = Math.random().toString().slice(4)
                let qs = new URLSearchParams({
                    host,
                    id,
                    params: JSON.stringify(params),
                    type
                })
                if (typeof finalResult === 'string') {
                    qs.set('result', finalResult)
                }
                // center prompt
                const {top, left} = await getPosition(width, height)
                // prompt will be resolved with true or false
                let accept = await new Promise((resolve, reject) => {
                    openPrompt = {resolve, reject}
                    browser.windows.create({
                        url: `${browser.runtime.getURL('prompt.html')}?${qs.toString()}`,
                        type: 'popup',
                        width: width,
                        height: height,
                        top: top,
                        left: left
                    })
                })
                // denied, stop here
                if (!accept) return {error: {message: 'denied'}}
            } catch (err) {
                // errored, stop here
                releasePromptMutex()
                return {
                    error: {message: err.message, stack: err.stack}
                }
            }
        }
        // the call was authorized, so we just return the result we had from before
        return finalResult
    }
}
