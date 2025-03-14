import browser, {Windows} from 'webextension-polyfill'
import {sayHello} from './utils'
import {
    getPermissionStatus,
    getPosition,
    NO_PERMISSIONS_REQUIRED,
    showNotification,
    updatePermission
} from './explode/common'
import * as nip19 from 'nostr-tools/nip19'
import {EventPointer, NEvent, ProfilePointer} from 'nostr-tools/nip19'
import {Mutex} from 'async-mutex'
import {finalizeEvent, getPublicKey, validateEvent} from 'nostr-tools/pure'
import * as nip04 from 'nostr-tools/nip04'
import * as nip44 from 'nostr-tools/nip44'
import CreateCreateDataType = Windows.CreateCreateDataType
import * as url from 'node:url'

browser.runtime.onInstalled.addListener(() => {
    console.log('Service Worker Loaded (TypeScript)!!!!')
    sayHello()
})

// Listen for messages from other parts of the extension (e.g., content scripts or popup)
// browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
//     console.log('Received message:', message);
//     sayHello();
//
//     const key = generateSecretKey()
//
//     console.log(nip19.nsecEncode(key))
//
//     if (message.type === 'getPublicKey') {
//         sendResponse('I am BOB!');
//     }
//
//     return true; // Required if response is async
// });

//set the width and height of the prompt window
const width = 440
const height = 420

export async function openSignUpWindow() {
    const {top, left} = await getPosition(width, height)

    browser.windows.create({
        url: `${browser.runtime.getURL('signup.html')}`,
        type: 'popup',
        width: width,
        height: height,
        top: top,
        left: left
    })
}

let openPrompt: any

let releasePromptMutex = () => {}

export async function handlePromptMessage(
    {host, type, accept, conditions}: any,
    sender: {
        tab: {windowId: number}
    }
) {
    // return response
    openPrompt?.resolve?.(accept)

    // update policies
    if (conditions) {
        await updatePermission(host, type, accept, conditions)
    }

    // cleanup this
    openPrompt = null

    // release mutex here after updating policies
    releasePromptMutex()

    // close prompt
    if (sender) {
        browser.windows.remove(sender.tab.windowId)
    }
}

browser.runtime.onMessage.addListener(async (message: any, sender: any) => {
    console.log(`Received ${message}`)
    if (message.openSignUp) {
        console.log(`Received4 ${message}`)
        await openSignUpWindow()
        browser.windows.remove(sender.tab.windowId)
    } else {
        const {prompt} = message
        if (prompt) {
            console.log(`Received3 ${message}`)
            await handlePromptMessage(message, sender)
        } else {
            console.log(`Received2 ${message}`)
            return handleContentScriptMessage(message)
        }
    }
})

// browser.runtime.onMessageExternal.addListener(
//     async ({type, params}, sender) => {
//         let extensionId = new URL(sender.url).host
//         return handleContentScriptMessage({type, params, host: extensionId})
//     }
// )

const promptMutex = new Mutex()

async function performOperation(type: any, params: {event?: any; peer?: any; plaintext?: any; ciphertext?: any}) {
    console.log(`Performing ${type}: ${JSON.stringify(params, null, 2)}`)

    const results = await browser.storage.local.get('private_key')

    console.log('sk:' + JSON.stringify(results))

    if (!results || !results.private_key) {
        return {error: {message: 'no private key found'}}
    }

    const sk = results.private_key as Uint8Array
    try {
        switch (type) {
            case 'getPublicKey': {
                return getPublicKey(sk)
            }
            case 'signEvent': {
                const event = finalizeEvent(params.event, sk)
                return validateEvent(event) ? event : {error: {message: 'invalid event'}}
            }
            case 'nip04.encrypt': {
                const {peer, plaintext} = params
                return nip04.encrypt(sk, peer, plaintext)
            }
            case 'nip04.decrypt': {
                const {peer, ciphertext} = params
                return nip04.decrypt(sk, peer, ciphertext)
            }
            // case 'nip44.encrypt': {
            //     const {peer, plaintext} = params
            //     const key = getSharedSecret(sk, peer)
            //
            //     return nip44.v2.encrypt(plaintext, key)
            // }
            // case 'nip44.decrypt': {
            //     const {peer, ciphertext} = params
            //     const key = getSharedSecret(sk, peer)
            //
            //     return nip44.v2.decrypt(ciphertext, key)
            // }
        }
    } catch (error: any) {
        return {error: {message: error.message, stack: error.stack}}
    }
}

// TODO Fix very ugly hardcode by actually asking the user
async function askForPermission(url: string) {
    return true
}

async function handleContentScriptMessage({type, params, host}: any, sender?: any) {
    const t: string = type as string

    if (NO_PERMISSIONS_REQUIRED[t]) {
        // authorized, and we won't do anything with private key here, so do a separate handler

        console.log('HHHHH' + type + ':' + params)

        switch (type) {
            case 'replaceURL': {
                const {protocol_handler: ph} = await browser.storage.local.get(['protocol_handler'])
                if (!ph) return false

                const {url} = params
                const raw = url.split('nostr:')[1]
                const {type, data} = nip19.decode(raw)

                const nprofile: ProfilePointer | undefined = type === 'nprofile' ? (data as ProfilePointer) : undefined

                const replacements = {
                    raw,
                    hrp: type,
                    hex:
                        type === 'npub' || type === 'note'
                            ? data
                            : type === 'nprofile'
                              ? (data as ProfilePointer).pubkey
                              : type === 'nevent'
                                ? (data as EventPointer).id
                                : null,
                    // TODO We have added ranodm replacements here will this work?
                    p_or_e: {npub: 'p', note: 'e', nprofile: 'p', nevent: 'e', naddr: 'p', nsec: 'p'}[type],
                    u_or_n: {npub: 'u', note: 'n', nprofile: 'u', nevent: 'n', naddr: 'n', nsec: 'n'}[type],
                    relay0: type === 'nprofile' ? nprofile?.relays?.at(0) : null,
                    relay1: type === 'nprofile' ? nprofile?.relays?.at(1) : null,
                    relay2: type === 'nprofile' ? nprofile?.relays?.at(2) : null
                }
                let result: string = ph as string
                Object.entries(replacements).forEach(([pattern, value]) => {
                    result = result.replace(new RegExp(`{ *${pattern} *}`, 'g'), value)
                })

                return result
            }
        }

        return
    } else {
        console.log('HHHHssssH' + type + ':' + params)
        // // acquire mutex here before reading policies
        releasePromptMutex = await promptMutex.acquire()

        console.log('HHHHssssssssssH' + type + ':' + params)

        // do the operation before asking (because we'll show the encryption/decryption results in the popup
        const finalResult = await performOperation(type, params)

        const allowed = await getPermissionStatus(host, type, type === 'signEvent' ? params.event : undefined)

        if (allowed === true) {
            // authorized, proceed
            releasePromptMutex()
            showNotification(host, allowed, type, params).then()
        } else if (allowed === false) {
            // denied, just refuse immediately
            releasePromptMutex()
            showNotification(host, allowed, type, params).then()
            return {
                error: {message: 'denied'}
            }
        } else {
            // ask for authorization
            try {
                const id = Math.random().toString().slice(4)
                const qs = new URLSearchParams({
                    host,
                    id,
                    params: JSON.stringify(params),
                    type
                })
                if (typeof finalResult === 'string') {
                    qs.set('result', finalResult)
                }

                // let accept = await new Promise((resolve, reject) => {
                //     // openPrompt = {resolve, reject}
                //     resolve(askForPermission(qs.toString()))
                // })

                const accept = await askForPermission(qs.toString())
                releasePromptMutex()

                // denied, stop here
                if (!accept) return {error: {message: 'denied'}}
            } catch (err: any) {
                // errored, stop here
                releasePromptMutex()
                return {
                    error: {message: err.message, stack: err.stack}
                }
            }
        }
        //
        // // the call was authorized, so we just return the result we had from before
        return finalResult
    }
}
