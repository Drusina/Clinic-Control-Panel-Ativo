import { useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewMode = "cards" | "table";

const AUTO_TABLE_THRESHOLD = 10;

function readStored(key: string): ViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(key);
    if (v === "cards" || v === "table") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writeStored(key: string, mode: ViewMode | null) {
  if (typeof window === "undefined") return;
  try {
    if (mode === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, mode);
  } catch {
    /* ignore */
  }
}

/**
 * Decides the effective view mode:
 *   - manual preference (from localStorage) wins when present
 *   - otherwise: tabela quando count > 10, cards caso contrário
 */
export function useViewMode(storageKey: string, count: number) {
  const [manual, setManual] = useState<ViewMode | null>(() => readStored(storageKey));

  useEffect(() => {
    setManual(readStored(storageKey));
  }, [storageKey]);

  const effective: ViewMode = manual ?? (count > AUTO_TABLE_THRESHOLD ? "table" : "cards");

  const setMode = (mode: ViewMode) => {
    setManual(mode);
    writeStored(storageKey, mode);
  };

  return { mode: effective, setMode, isManual: manual !== null };
}

export function ViewToggle({
  mode,
  onChange,
  className,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border bg-background p-0.5",
        className,
      )}
      role="group"
      aria-label="Modo de visualização"
    >
      <Button
        type="button"
        variant={mode === "cards" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 px-2"
        onClick={() => onChange("cards")}
        aria-pressed={mode === "cards"}
        title="Visualizar em cards"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="ml-1.5 text-xs hidden sm:inline">Cards</span>
      </Button>
      <Button
        type="button"
        variant={mode === "table" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 px-2"
        onClick={() => onChange("table")}
        aria-pressed={mode === "table"}
        title="Visualizar em tabela"
      >
        <List className="h-3.5 w-3.5" />
        <span className="ml-1.5 text-xs hidden sm:inline">Tabela</span>
      </Button>
    </div>
  );
}
