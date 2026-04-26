import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export function NewCategoryModal({
  open,
  onOpenChange,
  onCreate,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (name: string) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova categoria</DialogTitle>
          <DialogDescription>
            Crie uma nova categoria para organizar os documentos da clínica.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Nome</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Documentos do Paciente"
              maxLength={120}
              autoFocus
              data-testid="input-category-name"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()} data-testid="btn-save-category">
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditCategoryModal({
  open,
  onOpenChange,
  initialName,
  onSave,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialName: string;
  onSave: (name: string) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renomear categoria</DialogTitle>
          <DialogDescription>Atualize o nome da categoria.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name-edit">Nome</Label>
            <Input
              id="cat-name-edit"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
