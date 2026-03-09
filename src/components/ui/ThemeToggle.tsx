import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type ThemeName = "glass" | "dark" | "light";

const THEME_STORAGE_KEY = "theme";
const DEFAULT_THEME: ThemeName = "glass";
const THEME_TOGGLE_CLASS = "min-w-[70px]";
const THEME_SEQUENCE: ThemeName[] = ["glass", "dark", "light"];
const THEME_LABELS: Record<ThemeName, string> = {
    glass: "Glass",
    dark: "Dark",
    light: "Light",
};

function normalizeTheme(value: string | null): ThemeName {
    if (value === "glass" || value === "dark" || value === "light") {
        return value;
    }
    return DEFAULT_THEME;
}

export function ThemeToggle() {
    const [theme, setTheme] = useState<ThemeName>(() => {
        try {
            return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
        } catch {
            return DEFAULT_THEME;
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

            window.localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {
            // ignore
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme((current) => {
            const currentIndex = THEME_SEQUENCE.indexOf(current);
            const nextIndex = (currentIndex + 1) % THEME_SEQUENCE.length;
            return THEME_SEQUENCE[nextIndex];
        });
    };

    return (
        <Button
            variant="outline"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className={THEME_TOGGLE_CLASS}
        >
            {THEME_LABELS[theme]}
        </Button>
    );
}

export default ThemeToggle;
