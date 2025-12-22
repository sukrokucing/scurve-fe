import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface EmptyStateProps {
    title: string;
    description: string;
    icon?: ReactNode;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed rounded-lg bg-muted/30">
            {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="max-w-xs mt-2 text-sm text-muted-foreground">{description}</p>
            {action && (
                <Button onClick={action.onClick} className="mt-6" variant="outline">
                    {action.label}
                </Button>
            )}
        </div>
    );
}
