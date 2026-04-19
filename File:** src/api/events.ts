// Could add error handling for event listeners
export function onNewMessage(
    callback: (event: NewMessageEvent) => void,
): Promise<UnlistenFn> {
    return listen<NewMessageEvent>("new-message", (e) => {
        try {
            callback(e.payload);
        } catch (error) {
            console.error("Error in new message handler:", error);
        }
    });
}
