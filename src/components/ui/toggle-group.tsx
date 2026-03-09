"use client"

import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const TOGGLE_GROUP_BASE_CLASS = "inline-flex rounded-lg bg-muted p-1 text-muted-foreground"
const TOGGLE_GROUP_VARIANT_OUTLINE_CLASS = "border border-input bg-transparent"
const TOGGLE_GROUP_ITEM_BASE_CLASS =
    "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
const TOGGLE_GROUP_ITEM_VARIANT_DEFAULT_CLASS =
    "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
const TOGGLE_GROUP_ITEM_VARIANT_OUTLINE_CLASS =
    "border border-transparent data-[state=on]:border-input data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"

const toggleGroupVariants = cva(
    TOGGLE_GROUP_BASE_CLASS,
    {
        variants: {
            variant: {
                default: "bg-muted",
                outline: TOGGLE_GROUP_VARIANT_OUTLINE_CLASS,
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

const toggleGroupItemVariants = cva(
    TOGGLE_GROUP_ITEM_BASE_CLASS,
    {
        variants: {
            variant: {
                default: TOGGLE_GROUP_ITEM_VARIANT_DEFAULT_CLASS,
                outline: TOGGLE_GROUP_ITEM_VARIANT_OUTLINE_CLASS,
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

const ToggleGroupContext = React.createContext<
    VariantProps<typeof toggleGroupVariants>
>({
    variant: "default",
})

const ToggleGroup = React.forwardRef<
    React.ElementRef<typeof ToggleGroupPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
    VariantProps<typeof toggleGroupVariants>
>(({ className, variant, children, ...props }, ref) => (
    <ToggleGroupPrimitive.Root
        ref={ref}
        className={cn(toggleGroupVariants({ variant }), className)}
        {...props}
    >
        <ToggleGroupContext.Provider value={{ variant }}>
            {children}
        </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
))

ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName

const ToggleGroupItem = React.forwardRef<
    React.ElementRef<typeof ToggleGroupPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
    VariantProps<typeof toggleGroupItemVariants>
>(({ className, children, variant, ...props }, ref) => {
    const context = React.useContext(ToggleGroupContext)

    return (
        <ToggleGroupPrimitive.Item
            ref={ref}
            className={cn(
                toggleGroupItemVariants({
                    variant: context.variant || variant,
                }),
                className
            )}
            {...props}
        >
            {children}
        </ToggleGroupPrimitive.Item>
    )
})

ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName

export { ToggleGroup, ToggleGroupItem }
