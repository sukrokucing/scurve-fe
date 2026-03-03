import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 200): T {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        if (delayMs <= 0) {
            setDebouncedValue(value);
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setDebouncedValue(value);
        }, delayMs);

        return () => window.clearTimeout(timeoutId);
    }, [value, delayMs]);

    return debouncedValue;
}
