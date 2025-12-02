import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AuthLayoutProps = {
    title: string;
    description?: string;
    form: ReactNode;
    footer?: {
        prompt: string;
        linkLabel: string;
        linkTo: string;
    };
    className?: string;
};

import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function AuthLayout({ title, description, form, footer, className }: AuthLayoutProps) {
    return (
        <div className="w-full min-h-screen bg-gradient-to-br from-background via-background to-primary/10 relative">
            <div className="absolute top-4 right-4 bg-background/50 backdrop-blur-sm rounded-md p-1 shadow-sm">
                <ThemeToggle />
            </div>
            <main className="flex flex-col items-center justify-center w-full max-w-5xl min-h-screen px-6 py-12 mx-auto" role="main">
                <Card className={cn("w-full max-w-lg shadow-xl", className)}>
                    <CardHeader className="space-y-2 text-center">
                        {/* Use a semantic h1 for page title to satisfy page-has-heading-one rule */}
                        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                        {description ? (
                            <CardDescription className="text-muted-foreground">{description}</CardDescription>
                        ) : null}
                    </CardHeader>
                    <CardContent>{form}</CardContent>
                </Card>
                {footer ? (
                    // Slightly tighter spacing between the card and footer for a more compact auth layout
                    <footer className="pb-8 mt-6 text-sm text-center text-muted-foreground">
                        {footer.prompt}{" "}
                        <Link className="font-medium text-primary-foreground hover:underline" to={footer.linkTo}>
                            {footer.linkLabel}
                        </Link>
                    </footer>
                ) : null}
            </main>
        </div>
    );
}
