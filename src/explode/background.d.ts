export function handleContentScriptMessage({type, params, host}: {type: any; params: any; host: any}): Promise<any>
export function handlePromptMessage(
    {
        host,
        type,
        accept,
        conditions
    }: {
        host: any
        type: any
        accept: any
        conditions: any
    },
    sender: any
): Promise<void>
export function openSignUpWindow(): Promise<void>
export function releasePromptMutex(): void
