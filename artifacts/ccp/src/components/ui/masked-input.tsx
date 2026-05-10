import * as React from "react";

import { Input } from "@/components/ui/input";

export type MaskKind = "cpf" | "cnpj" | "phone";

function onlyDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

function formatCpf(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatCnpj(digits: string): string {
  const d = digits.slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatPhone(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function applyMask(mask: MaskKind, raw: string): string {
  const digits = onlyDigits(raw);
  if (!digits) return "";
  if (mask === "cpf") return formatCpf(digits);
  if (mask === "cnpj") return formatCnpj(digits);
  return formatPhone(digits);
}

export interface MaskedInputProps
  extends Omit<React.ComponentProps<"input">, "onChange" | "value" | "defaultValue"> {
  mask: MaskKind;
  value?: string | null;
  onChange?: (value: string) => void;
}

const MASK_PLACEHOLDER: Record<MaskKind, string> = {
  cpf: "000.000.000-00",
  cnpj: "00.000.000/0000-00",
  phone: "(00) 00000-0000",
};

const MaskedInput = React.forwardRef<HTMLInputElement, MaskedInputProps>(
  ({ mask, value, onChange, placeholder, inputMode, ...rest }, ref) => {
    const display = applyMask(mask, value ?? "");

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const masked = applyMask(mask, e.target.value);
      onChange?.(masked);
    };

    return (
      <Input
        {...rest}
        ref={ref}
        type="text"
        inputMode={inputMode ?? (mask === "phone" ? "tel" : "numeric")}
        autoComplete="off"
        placeholder={placeholder ?? MASK_PLACEHOLDER[mask]}
        value={display}
        onChange={handleChange}
      />
    );
  },
);
MaskedInput.displayName = "MaskedInput";

export { MaskedInput };
