import { useState, useRef, useEffect } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import * as chrono from "chrono-node";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
            onChange(null);
            return;
        }

        // Try to parse as natural language with Chrono
        const results = chrono.parse(text);

        if (results.length === 0) {
            // No valid date found
            return;
        }

        if (results.length === 1) {
            // Single date or range
            const result = results[0];
            if (result.end) {
                // It's a range
                const startDate = result.start.date();
                const endDate = result.end.date();
                onChange([startDate, endDate]);
            } else {
                // Single date
                onChange(result.start.date());
            }
        } else if (results.length === 2) {
            // Two separate dates = range
            const startDate = results[0].start.date();
            const endDate = results[1].start.date();
            onChange([startDate, endDate]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
        }
    };

    const handleCalendarSelect = (selected: any) => {
        if (!selected) {
            onChange(null);
            setInputValue("");
        } else if (mode === "range") {
            // Handle range selection (DateRange object from react-day-picker)
            if (selected?.from) {
                if (selected.to) {
                    onChange([selected.from, selected.to]);
                    setIsOpen(false); // Close only when both dates are selected
                } else {
                    // Only start date selected so far, don't close yet
                    // We can't pass a partial range to onChange based on current type signature
                    // So we might need to wait or handle internal state if we want to show partial selection
                    // For now, let's just not trigger onChange until we have both, or trigger with same date
                }
            }
        } else {
            // Single date
            onChange(selected as Date);
            setIsOpen(false);
        }
    };

    // Prepare value for Calendar component
    const calendarSelected = mode === "range"
        ? (Array.isArray(value) ? { from: value[0], to: value[1] } : undefined)
        : (value instanceof Date ? value : undefined);

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
                    <Calendar
                        mode={mode as any}
                        selected={calendarSelected}
                        onSelect={handleCalendarSelect}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}
