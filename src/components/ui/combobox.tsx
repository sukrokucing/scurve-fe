import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
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
}

interface ComboboxProps {
    options: Option[]
    value?: string
    onChange: (value: string) => void
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    className?: string
    height?: string
    children?: React.ReactNode // Custom trigger
}

export function Combobox({
    options = [],
    value,
    onChange,
    placeholder = "Select option...",
    searchPlaceholder = "Search...",
    emptyText = "No option found.",
    className,
    height = "300px", // Default max height
    children
}: ComboboxProps) {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")

    // Filter options manually since we are virtualizing
    const filteredOptions = React.useMemo(() => {
        if (!search) return options
        const lowerSearch = search.toLowerCase()
        return options.filter((option) =>
            option.label.toLowerCase().includes(lowerSearch)
        )
    }, [options, search])

    const [parentRef, setParentRef] = React.useState<HTMLDivElement | null>(null)

    const rowVirtualizer = useVirtualizer({
        count: filteredOptions.length,
        getScrollElement: () => parentRef,
        estimateSize: () => 35, // Estimate row height (px)
        overscan: 5,
    })

    // Find selected label for display
    const selectedLabel = React.useMemo(() =>
        options.find((option) => option.value === value)?.label,
        [options, value]
    )

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                {children ? children : (
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className={cn("w-full justify-between", className)}
                    >
                        {value ? selectedLabel : placeholder}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                )}
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
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
                        {filteredOptions.length === 0 && (
                            <CommandEmpty>{emptyText}</CommandEmpty>
                        )}

                        <div
                            style={{
                                height: `${rowVirtualizer.getTotalSize()}px`,
                                width: '100%',
                                position: 'relative',
                            }}
                        >
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const option = filteredOptions[virtualRow.index]
                                return (
                                    <CommandItem
                                        key={option.value}
                                        value={option.value}
                                        onSelect={(currentValue) => {
                                            // cmdk converts value to lowercase, so we need to use the original option.value
                                            // explicitly calling onChange with the real value
                                            onChange(option.value === value ? "" : option.value)
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
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
