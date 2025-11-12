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

export function AuthLayout({ title, description, form, footer, className }: AuthLayoutProps) {
  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-background via-background to-primary/10">
      <main className="flex items-center justify-center w-full max-w-5xl min-h-screen px-6 py-12 mx-auto" role="main">
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
      </main>
      {footer ? (
        <p className="pb-12 text-sm text-center text-muted-foreground">
          {footer.prompt}{" "}
          <Link className="font-medium text-primary hover:underline" to={footer.linkTo}>
            {footer.linkLabel}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
