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
      // Clear previous theme classes we manage
      root.classList.remove("theme-glass");
      if (theme === "glass") {
        root.classList.add("theme-glass");
      }
      window.localStorage.setItem("theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setTheme((t) => (t === "glass" ? "default" : "glass"))}
      aria-label="Toggle theme"
    >
      {theme === "glass" ? "Glass" : "Default"}
    </Button>
  );
}

export default ThemeToggle;
