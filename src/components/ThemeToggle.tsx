import { Moon, Sun } from "lucide-react";
import type { Theme } from "../hooks/useTheme";
import { IconButton } from "./IconButton";

interface ThemeToggleProps {
  readonly theme: Theme;
  readonly onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <IconButton label={`Switch to ${nextTheme} map`} onClick={onToggle} className="icon-button--floating">
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
}
