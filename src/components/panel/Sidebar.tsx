import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { ScrollArea } from "../ScrollArea";

export const SIDEBAR_FOOTPRINT = 432;

interface SidebarProps {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly label: string;
  /** Changing the key remounts the scroll area so each view starts at the top. */
  readonly contentKey: string;
  readonly children: ReactNode;
}

export function Sidebar({ isOpen, onToggle, label, contentKey, children }: SidebarProps) {
  return (
    <aside className={isOpen ? "sidebar" : "sidebar sidebar--closed"} aria-label={label}>
      <ScrollArea key={contentKey} className="sidebar__content" inert={!isOpen}>
        {children}
      </ScrollArea>
      <button
        type="button"
        className="sidebar__toggle"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Collapse side panel" : "Expand side panel"}
        title={isOpen ? "Collapse side panel" : "Expand side panel"}
      >
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
    </aside>
  );
}
