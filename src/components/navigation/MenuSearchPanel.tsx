import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { SEARCH_MENU_ENTRIES, type MenuEntry } from "@/navigation/menuCatalog";
import { filterAndRankMenu, getFirstMenuResult } from "@/navigation/menuSearch";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

type MenuSearchPanelProps = {
    onNavigate?: () => void;
    autoFocus?: boolean;
    testIdPrefix?: string;
    className?: string;
    showHint?: boolean;
};

function buildTestId(baseId: string, prefix?: string) {
    return prefix ? `${prefix}-${baseId}` : baseId;
}

export function MenuSearchPanel({
    onNavigate,
    autoFocus = false,
    testIdPrefix,
    className,
    showHint = true,
}: MenuSearchPanelProps) {
    const [queryInput, setQueryInput] = useState("");
    const commandRootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const location = useLocation();
    const debouncedQuery = useDebouncedValue(queryInput, 120);
    const query = useDeferredValue(debouncedQuery);

    useEffect(() => {
        if (!autoFocus) return;
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 40);
        return () => clearTimeout(timer);
    }, [autoFocus]);

    useEffect(() => {
        setQueryInput("");
    }, [location.pathname]);

    const results = useMemo(() => filterAndRankMenu(query, SEARCH_MENU_ENTRIES), [query]);

    const groupedResults = useMemo(() => {
        const main = results.filter((entry) => entry.section === "main");
        const settings = results.filter((entry) => entry.section === "settings");
        return { main, settings };
    }, [results]);
    const resultById = useMemo(
        () => new Map(results.map((entry) => [entry.id, entry])),
        [results],
    );

    const navigateToEntry = useCallback((entry: MenuEntry) => {
        navigate(entry.to);
        setQueryInput("");
        onNavigate?.();
    }, [navigate, onNavigate]);

    const navigateToFirstResult = useCallback(() => {
        const firstResult = getFirstMenuResult(queryInput, SEARCH_MENU_ENTRIES);
        if (!firstResult) return;
        navigateToEntry(firstResult);
    }, [navigateToEntry, queryInput]);

    const navigateToHighlightedResult = useCallback(() => {
        const root = commandRootRef.current;
        if (!root) return false;

        const selectedItem = root.querySelector<HTMLElement>(
            "[cmdk-item][data-selected='true'], [cmdk-item][aria-selected='true']",
        );
        const selectedId = selectedItem?.dataset.menuEntryId;
        if (!selectedId) return false;

        const entry = resultById.get(selectedId);
        if (!entry) return false;
        const immediateResults = filterAndRankMenu(queryInput, SEARCH_MENU_ENTRIES);
        const isSelectionStillRelevant = immediateResults.some((result) => result.id === selectedId);
        if (!isSelectionStillRelevant) return false;
        navigateToEntry(entry);
        return true;
    }, [navigateToEntry, queryInput, resultById]);

    return (
        <div className={cn("space-y-2", className)}>
            <Command
                ref={commandRootRef}
                shouldFilter={false}
                className="rounded-lg bg-background shadow-sm [&_[cmdk-input-wrapper]]:border-b-0"
            >
                <CommandInput
                    ref={inputRef}
                    aria-label="Search menu"
                    wrapperClassName="border-0"
                    className="focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0"
                    value={queryInput}
                    onValueChange={setQueryInput}
                    placeholder="Search menu..."
                    data-testid={buildTestId("menu-search-input", testIdPrefix)}
                    onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return;
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        if (!navigateToHighlightedResult()) {
                            navigateToFirstResult();
                        }
                    }}
                />

                <CommandList className="max-h-[min(58vh,420px)] pr-1 [scrollbar-gutter:stable] md:max-h-[280px]">
                    {results.length === 0 ? (
                        <CommandEmpty data-testid={buildTestId("menu-search-empty", testIdPrefix)}>
                            No menu found
                        </CommandEmpty>
                    ) : null}

                    {groupedResults.main.length > 0 ? (
                        <CommandGroup heading="Main">
                            {groupedResults.main.map((entry) => (
                                <CommandItem
                                    key={entry.id}
                                    value={entry.label}
                                    onSelect={() => navigateToEntry(entry)}
                                    data-testid={buildTestId("menu-search-result-item", testIdPrefix)}
                                    data-menu-entry-id={entry.id}
                                >
                                    <entry.icon className="h-4 w-4 text-muted-foreground" />
                                    <span className="flex-1">{entry.label}</span>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ) : null}

                    {groupedResults.settings.length > 0 ? (
                        <CommandGroup heading="Settings">
                            {groupedResults.settings.map((entry) => (
                                <CommandItem
                                    key={entry.id}
                                    value={entry.label}
                                    onSelect={() => navigateToEntry(entry)}
                                    data-testid={buildTestId("menu-search-result-item", testIdPrefix)}
                                    data-menu-entry-id={entry.id}
                                >
                                    <entry.icon className="h-4 w-4 text-muted-foreground" />
                                    <span className="flex-1">{entry.label}</span>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ) : null}
                </CommandList>
            </Command>

            {showHint ? (
                <p className="text-[11px] text-muted-foreground">
                    Press Enter to open first result
                </p>
            ) : null}
        </div>
    );
}
