import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/10">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-12">
        <Card className={cn("w-full max-w-lg shadow-xl", className)}>
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl font-semibold tracking-tight">{title}</CardTitle>
            {description ? (
              <CardDescription className="text-muted-foreground">{description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>{form}</CardContent>
        </Card>
      </div>
      {footer ? (
        <p className="pb-12 text-center text-sm text-muted-foreground">
          {footer.prompt}{" "}
          <Link className="font-medium text-primary hover:underline" to={footer.linkTo}>
            {footer.linkLabel}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
