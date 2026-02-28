import * as React from "react";

import {
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

type AppDialogContentProps = Omit<React.ComponentPropsWithoutRef<typeof DialogContent>, "title"> & {
    title: React.ReactNode;
    description: React.ReactNode;
};

const AppDialogContent = React.forwardRef<
    React.ElementRef<typeof DialogContent>,
    AppDialogContentProps
>(({ title, description, children, ...props }, ref) => (
    <DialogContent ref={ref} {...props}>
        <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
    </DialogContent>
));

AppDialogContent.displayName = "AppDialogContent";

export { AppDialogContent };
