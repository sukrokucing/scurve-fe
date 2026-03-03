import { useState, useRef, useEffect } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

let chronoModulePromise: Promise<typeof import("chrono-node")> | null = null;

function getChronoModule() {
    if (!chronoModulePromise) {
        chronoModulePromise = import("chrono-node");
    }
    return chronoModulePromise;
}

interface DateInputProps {
    value?: Date | [Date, Date] | null;
    onChange: (value: Date | [Date, Date] | null) => void;
    placeholder?: string;
    className?: string;
    mode?: "single" | "range";
}

export function DateInput({ value, onChange, placeholder = 'Try "tomorrow" or "in 10 days"', className, mode = "single" }: DateInputProps) {
    const [inputValue, setInputValue] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const parseRequestIdRef = useRef(0);

    // Update input display when value prop changes
    useEffect(() => {
        if (!value) {
            setInputValue("");
        } else if (Array.isArray(value)) {
            // Date range
            const start = format(value[0], "MMM d, yyyy");
            const end = format(value[1], "MMM d, yyyy");
            setInputValue(`${start} to ${end}`);
        } else {
            // Single date
            setInputValue(format(value, "MMM d, yyyy"));
        }
    }, [value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const text = e.target.value;
        setInputValue(text);

        if (!text.trim()) {
            parseRequestIdRef.current += 1;
            onChange(null);
            return;
        }

        const requestId = ++parseRequestIdRef.current;

        // Defer heavy chrono-node bundle until the user actually types a date expression.
        void (async () => {
            try {
                const chronoModule = await getChronoModule();
                if (requestId !== parseRequestIdRef.current) return;

                const results = chronoModule.parse(text);
                if (results.length === 0) return;

                if (results.length === 1) {
                    const result = results[0];
                    if (result.end) {
                        onChange([result.start.date(), result.end.date()]);
                    } else {
                        onChange(result.start.date());
                    }
                    return;
                }

                if (results.length === 2) {
                    onChange([results[0].start.date(), results[1].start.date()]);
                }
            } catch (error) {
                console.warn("Failed to load chrono parser", error);
            }
        })();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
        }
    };

    const handleSingleSelect = (selected: Date | undefined) => {
        if (!selected) {
            onChange(null);
            setInputValue("");
        } else {
            onChange(selected);
            setIsOpen(false);
        }
    };

    const handleRangeSelect = (selected: DateRange | undefined) => {
        if (!selected) {
            onChange(null);
            setInputValue("");
            return;
        }

        if (selected.from && selected.to) {
            onChange([selected.from, selected.to]);
            setIsOpen(false);
        }
    };

    const rangeSelected: DateRange | undefined = Array.isArray(value)
        ? { from: value[0], to: value[1] }
        : undefined;

    const singleSelected = value instanceof Date ? value : undefined;

    return (
        <div className={cn("flex items-stretch gap-0", className)}>
            <Input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                className="flex-1 rounded-r-none border-r-0"
            />
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className={cn(
                            "rounded-l-none px-3",
                            !value && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="h-4 w-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    {mode === "range" ? (
                        <Calendar
                            mode="range"
                            selected={rangeSelected}
                            onSelect={handleRangeSelect}
                            initialFocus
                        />
                    ) : (
                        <Calendar
                            mode="single"
                            selected={singleSelected}
                            onSelect={handleSingleSelect}
                            initialFocus
                        />
                    )}
                </PopoverContent>
            </Popover>
        </div>
    );
}
