import { SEARCH_MENU_ENTRIES } from "@/navigation/menuCatalog";
import { filterAndRankMenu } from "@/navigation/menuSearch";

function assertCondition(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`menuSearch test failed: ${message}`);
    }
}

function runMenuSearchUnitTests() {
    const exactRole = filterAndRankMenu("Roles", SEARCH_MENU_ENTRIES);
    assertCondition(exactRole[0]?.label === "Roles", "exact label match should rank first");

    const prefixProj = filterAndRankMenu("pro", SEARCH_MENU_ENTRIES);
    assertCondition(prefixProj[0]?.label === "Projects", "prefix label match should rank above contains");

    const keywordMatch = filterAndRankMenu("inheritance", SEARCH_MENU_ENTRIES);
    assertCondition(keywordMatch[0]?.to === "/settings/flow", "keyword fallback should return access flow first");

    const deterministicSort = filterAndRankMenu("", SEARCH_MENU_ENTRIES);
    const firstTwo = deterministicSort.slice(0, 2).map((entry) => entry.label).join("|");
    assertCondition(firstTwo === "Dashboard|Projects", "empty query should follow priority/label baseline order");
}

runMenuSearchUnitTests();

export {};

