export const OPEN_GLOBAL_MENU_SEARCH_EVENT = "scurve:open-menu-search";

export function openGlobalMenuSearch() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(OPEN_GLOBAL_MENU_SEARCH_EVENT));
}
