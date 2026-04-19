// Typing timeout cleanup could be improved
useEffect(() => {
    return () => {
        if (typingTimeout.current) {
            clearTimeout(typingTimeout.current);
        }
        // Send typing=false on unmount if we were typing
        api.sendTyping(roomId, false).catch(() => {});
    };
}, [roomId]);
