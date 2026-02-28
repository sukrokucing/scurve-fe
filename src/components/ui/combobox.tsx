import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

export type Option = {
    value: string
    label: string
    disabled?: boolean
}

interface ComboboxProps {
    options: Option[]
    value?: string
    onChange: (value: string) => void
    allowClear?: boolean
    onSearchChange?: (query: string) => void
    searchDebounceMs?: number
    minSearchLength?: number
    shouldFilterClientSide?: boolean
    isLoading?: boolean
    loadingText?: string
    virtualizeThreshold?: number
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    className?: string
    height?: string
    children?: React.ReactNode // Custom trigger
    triggerTestId?: string
    triggerAriaLabel?: string
}

export function Combobox({
    options = [],
    value,
    onChange,
    allowClear = false,
    onSearchChange,
    searchDebounceMs = 250,
    minSearchLength = 0,
    shouldFilterClientSide,
    isLoading = false,
    loadingText = "Loading options...",
    virtualizeThreshold = 200,
    placeholder = "Select option...",
    searchPlaceholder = "Search...",
    emptyText = "No option found.",
    className,
    height = "300px", // Default max height
    children,
    triggerTestId,
    triggerAriaLabel,
}: ComboboxProps) {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")
    const trimmedSearch = search.trim()
    const clientFilterEnabled = shouldFilterClientSide ?? !onSearchChange

    React.useEffect(() => {
        if (!open) {
            setSearch("")
        }
    }, [open])

    React.useEffect(() => {
        if (!open || !onSearchChange) {
            return
        }

        if (trimmedSearch.length < minSearchLength) {
            return
        }

        const timer = setTimeout(() => {
            onSearchChange(trimmedSearch)
        }, searchDebounceMs)

        return () => clearTimeout(timer)
    }, [open, onSearchChange, trimmedSearch, minSearchLength, searchDebounceMs])

    // Filter options manually since we are virtualizing
    const filteredOptions = React.useMemo(() => {
        if (!clientFilterEnabled || !search) return options
        const lowerSearch = search.toLowerCase()
        return options.filter((option) =>
            option.label.toLowerCase().includes(lowerSearch)
        )
    }, [options, search, clientFilterEnabled])

    const shouldShowMinSearchHint = Boolean(onSearchChange)
        && trimmedSearch.length > 0
        && trimmedSearch.length < minSearchLength

    const visibleOptions = shouldShowMinSearchHint ? [] : filteredOptions
    const shouldVirtualize = visibleOptions.length > virtualizeThreshold

    const [parentRef, setParentRef] = React.useState<HTMLDivElement | null>(null)

    const rowVirtualizer = useVirtualizer({
        count: shouldVirtualize ? visibleOptions.length : 0,
        getScrollElement: () => parentRef,
        estimateSize: () => 35, // Estimate row height (px)
        overscan: 5,
    })

    // Find selected label for display
    const selectedLabel = React.useMemo(() =>
        options.find((option) => option.value === value)?.label,
        [options, value]
    )

    const triggerLabel = value
        ? (selectedLabel ?? value)
        : placeholder

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                {children ? children : (
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        aria-label={triggerAriaLabel}
                        data-testid={triggerTestId}
                        className={cn("w-full justify-between overflow-hidden", className)}
                        title={triggerLabel}
                    >
                        <span className="min-w-0 truncate text-left">{triggerLabel}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                )}
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={searchPlaceholder}
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList
                        ref={setParentRef}
                        className="w-full overflow-y-auto overflow-x-hidden"
                        style={{ maxHeight: height }}
                    >
                        {visibleOptions.length === 0
                            ? (
                                <CommandEmpty>
                                    {shouldShowMinSearchHint
                                        ? `Type at least ${minSearchLength} characters`
                                        : (isLoading ? loadingText : emptyText)}
                                </CommandEmpty>
                            )
                            : null}

                        {shouldVirtualize
                            ? (
                                <div
                                    style={{
                                        height: `${rowVirtualizer.getTotalSize()}px`,
                                        width: '100%',
                                        position: 'relative',
                                    }}
                                >
                                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                        const option = visibleOptions[virtualRow.index]
                                        return (
                                            <CommandItem
                                                key={option.value}
                                                value={option.value}
                                                disabled={option.disabled}
                                                onSelect={() => {
                                                    // cmdk converts value to lowercase, so we need to use the original option.value
                                                    // explicitly calling onChange with the real value
                                                    if (option.value === value && !allowClear) {
                                                        setOpen(false)
                                                        return
                                                    }
                                                    onChange(option.value === value ? "" : option.value)
                                                    setSearch("")
                                                    setOpen(false)
                                                }}
                                                className="absolute left-0 top-0 w-full"
                                                style={{
                                                    transform: `translateY(${virtualRow.start}px)`,
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        value === option.value ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                {option.label}
                                            </CommandItem>
                                        )
                                    })}
                                </div>
                            )
                            : visibleOptions.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={option.value}
                                    disabled={option.disabled}
                                    onSelect={() => {
                                        // cmdk converts value to lowercase, so we need to use the original option.value
                                        // explicitly calling onChange with the real value
                                        if (option.value === value && !allowClear) {
                                            setOpen(false)
                                            return
                                        }
                                        onChange(option.value === value ? "" : option.value)
                                        setSearch("")
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === option.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {option.label}
                                </CommandItem>
                            ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
