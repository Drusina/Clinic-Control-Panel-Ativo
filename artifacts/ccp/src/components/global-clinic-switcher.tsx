import { useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

export interface SwitcherClinic {
  id: string;
  nome: string;
  fantasia?: string | null;
}

interface GlobalClinicSwitcherProps {
  clinics: SwitcherClinic[];
  activeClinicId: string | null;
  onPick: (clinicId: string) => void;
  variant?: "sidebar" | "header";
  /** testid applied to the trigger button (e.g. "portal-trocar-clinica"). */
  triggerTestId?: string;
  /** Custom leading icon for the trigger (defaults to a Building icon). */
  leading?: ReactNode;
  placeholder?: string;
  /** Optional "manage" action rendered below the clinic list. */
  manageLabel?: string;
  onManage?: () => void;
}

/**
 * Searchable clinic switcher shared by AppLayout (super_admin) and
 * PortalLayout (multi-clinic gestor). The component is intentionally "dumb":
 * routing + persistence decisions live in the layouts via `onPick`. Picking a
 * clinic is always an EXPLICIT user action, which preserves the clinic-first
 * isolation invariant (we never silently default a 2+ gestor to a clinic).
 */
export function GlobalClinicSwitcher({
  clinics,
  activeClinicId,
  onPick,
  variant = "sidebar",
  triggerTestId,
  leading,
  placeholder = "Selecionar clínica",
  manageLabel,
  onManage,
}: GlobalClinicSwitcherProps) {
  const [open, setOpen] = useState(false);
  const active = clinics.find((c) => c.id === activeClinicId) ?? null;
  const label = active?.fantasia || active?.nome || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={variant === "sidebar" ? "outline" : "ghost"}
          role="combobox"
          aria-expanded={open}
          data-testid={triggerTestId}
          className={cn(
            "justify-between gap-2 font-normal",
            variant === "sidebar"
              ? "w-full text-left"
              : "h-9 min-w-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {leading ?? <Building2 className="h-4 w-4 shrink-0 text-primary" />}
            <span className="truncate text-sm font-medium">{label}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar clínica..." />
          <CommandList>
            <CommandEmpty>Nenhuma clínica encontrada.</CommandEmpty>
            <CommandGroup heading="Trocar de clínica">
              {clinics.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.fantasia ?? ""} ${c.nome}`}
                  onSelect={() => {
                    setOpen(false);
                    onPick(c.id);
                  }}
                  data-testid={
                    triggerTestId ? `${triggerTestId}-item-${c.id}` : undefined
                  }
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      activeClinicId === c.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{c.fantasia || c.nome}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {onManage && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false);
                      onManage();
                    }}
                    data-testid="clinic-switcher-manage"
                  >
                    {manageLabel ?? "Gerenciar clínicas"}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
