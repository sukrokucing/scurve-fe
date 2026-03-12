/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const BUTTON_BASE_CLASS =
    "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-strong focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"

const BUTTON_VARIANT_DEFAULT_CLASS =
    "border border-primary/20 bg-primary text-primary-foreground hover:text-primary-foreground active:text-primary-foreground shadow-sm hover:bg-primary-hover hover:shadow-md active:bg-primary-active active:translate-y-px transition-all duration-200 [.theme-glass_&]:bg-primary/90 [.theme-glass_&]:hover:brightness-95 [.theme-glass_&]:active:brightness-90 [.theme-glass_&]:border-primary/35 [.theme-glass_&]:shadow-md"
const BUTTON_VARIANT_DESTRUCTIVE_CLASS =
    "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
const BUTTON_VARIANT_DESTRUCTIVE_OUTLINE_CLASS =
    "border-2 border-destructive bg-surface text-foreground hover:bg-destructive hover:text-destructive-foreground"
const BUTTON_VARIANT_OUTLINE_CLASS =
    "border border-input bg-surface text-foreground hover:text-foreground active:text-foreground shadow-sm hover:bg-surface-hover active:bg-surface-active"
const BUTTON_VARIANT_SECONDARY_CLASS =
    "border border-border bg-secondary text-secondary-foreground hover:text-secondary-foreground active:text-secondary-foreground shadow-sm hover:bg-secondary-hover active:bg-secondary-active active:translate-y-px [.theme-glass_&]:bg-secondary/78 [.theme-glass_&]:hover:brightness-95 [.theme-glass_&]:active:brightness-90 [.theme-glass_&]:border-border/85 [.theme-glass_&]:backdrop-blur-sm"
const BUTTON_VARIANT_GHOST_CLASS =
    "text-foreground hover:bg-accent-hover active:bg-accent-active hover:text-accent-foreground active:text-accent-foreground"
const BUTTON_VARIANT_LINK_CLASS = "text-primary underline-offset-4 hover:underline"

const buttonVariants = cva(
    BUTTON_BASE_CLASS,
    {
        variants: {
            variant: {
                default: BUTTON_VARIANT_DEFAULT_CLASS,
                destructive: BUTTON_VARIANT_DESTRUCTIVE_CLASS,
                "destructive-outline": BUTTON_VARIANT_DESTRUCTIVE_OUTLINE_CLASS,
                outline: BUTTON_VARIANT_OUTLINE_CLASS,
                secondary: BUTTON_VARIANT_SECONDARY_CLASS,
                ghost: BUTTON_VARIANT_GHOST_CLASS,
                link: BUTTON_VARIANT_LINK_CLASS,
            },
            size: {
                default: "h-11 px-4 py-2", // Increased to 44px for accessibility
                sm: "h-9 rounded-md px-3",
                lg: "h-12 rounded-md px-8",
                icon: "h-11 w-11", // Increased to 44px
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
