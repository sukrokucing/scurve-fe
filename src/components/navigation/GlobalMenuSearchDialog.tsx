import { useCallback, useMemo, useState } from "react";

import { MenuSearchPanel } from "@/components/navigation/MenuSearchPanel";
import { AppDialogContent } from "@/components/ui/app-dialog-content";
import { Dialog } from "@/components/ui/dialog";
import { useEvent } from "@/hooks/vendor/reactUse";
import { OPEN_GLOBAL_MENU_SEARCH_EVENT } from "@/navigation/menuSearchEvents";

function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function GlobalMenuSearchDialog() {
    const [open, setOpen] = useState(false);
    const browserWindow = typeof window === "undefined" ? undefined : window;
    const shortcutLabel = useMemo(
        () => (typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘K" : "Ctrl+K"),
        [],
    );

    const handleShortcut = useCallback((event: Event) => {
        if (!(event instanceof KeyboardEvent)) return;
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
        setOpen(true);
    }, []);

    const handleOpenEvent = useCallback(() => {
        setOpen(true);
    }, []);

    useEvent("keydown", handleShortcut, browserWindow);
    useEvent(OPEN_GLOBAL_MENU_SEARCH_EVENT, handleOpenEvent, browserWindow);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <AppDialogContent
                title="Search Menu"
                description="Find a destination quickly and press Enter to open the first result."
                className="w-[min(920px,calc(100vw-2rem))] max-w-none border-0"
                data-testid="global-menu-search-dialog"
            >
                <MenuSearchPanel
                    autoFocus={open}
                    showHint={false}
                    testIdPrefix="global"
                    onNavigate={() => setOpen(false)}
                />
                <div className="flex flex-wrap items-center justify-end gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <span>↑↓ Navigate</span>
                    <span>Enter Select</span>
                    <span>Esc Close</span>
                    <span>{shortcutLabel} Open</span>
                </div>
            </AppDialogContent>
        </Dialog>
    );
}
