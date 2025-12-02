import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
    const [theme, setTheme] = useState<string>(() => {
        try {
            return window.localStorage.getItem("theme") || "glass";
        } catch {
            return "glass";
        }
    });

    useEffect(() => {
        try {
            const root = document.documentElement;
            // Clear previous theme classes
            root.classList.remove("theme-glass", "dark");

            if (theme === "glass") {
                root.classList.add("theme-glass");
            } else if (theme === "dark") {
                root.classList.add("dark");
            }

            window.localStorage.setItem("theme", theme);
        } catch {
            // ignore
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme((current) => {
            if (current === "glass") return "dark";
            if (current === "dark") return "light";
            return "glass";
        });
    };

    const getThemeLabel = () => {
        if (theme === "glass") return "Glass";
        if (theme === "dark") return "Dark";
        return "Light";
    };

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="min-w-[70px]"
        >
            {getThemeLabel()}
        </Button>
    );
}

export default ThemeToggle;
