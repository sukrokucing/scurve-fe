import type { MenuEntry } from "@/navigation/menuCatalog";

type MatchRank = 1 | 2 | 3 | 4 | 5;

type RankedEntry = {
    entry: MenuEntry;
    rank: MatchRank;
};

const normalize = (value: string) => value.trim().toLowerCase();

const sortByPriorityAndLabel = (a: MenuEntry, b: MenuEntry) =>
    a.priority - b.priority || a.label.localeCompare(b.label);

function getMatchRank(entry: MenuEntry, query: string): MatchRank | null {
    const label = entry.label.toLowerCase();
    const words = label.split(/[\s/-]+/).filter(Boolean);

    if (label === query) return 1;
    if (label.startsWith(query)) return 2;
    if (words.some((word) => word.startsWith(query))) return 3;
    if (label.includes(query)) return 4;
    if (entry.keywords.some((keyword) => keyword.toLowerCase().includes(query))) return 5;

    return null;
}

export function filterAndRankMenu(query: string, entries: MenuEntry[]): MenuEntry[] {
    const normalizedQuery = normalize(query);
    const visibleEntries = entries.filter((entry) => !entry.hidden && !entry.disabled);

    if (!normalizedQuery) {
        return [...visibleEntries].sort(sortByPriorityAndLabel);
    }

    const rankedEntries: RankedEntry[] = [];
    visibleEntries.forEach((entry) => {
        const rank = getMatchRank(entry, normalizedQuery);
        if (rank !== null) {
            rankedEntries.push({ entry, rank });
        }
    });

    rankedEntries.sort((a, b) =>
        a.rank - b.rank
        || a.entry.priority - b.entry.priority
        || a.entry.label.localeCompare(b.entry.label),
    );

    return rankedEntries.map((item) => item.entry);
}

export function getFirstMenuResult(query: string, entries: MenuEntry[]): MenuEntry | null {
    return filterAndRankMenu(query, entries)[0] ?? null;
}

