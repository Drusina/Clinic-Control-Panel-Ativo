import * as React from "react";

import { Input } from "@/components/ui/input";

const formatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatFromCents(cents: number): string {
  return `${formatter.format(cents / 100)} %`;
}

export interface PercentageInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> {
  value?: number | null;
  onChange?: (value: number | null) => void;
  allowNull?: boolean;
}

const PercentageInput = React.forwardRef<HTMLInputElement, PercentageInputProps>(
  ({ value, onChange, allowNull = false, onBlur, placeholder, ...rest }, ref) => {
    const display = React.useMemo(() => {
      if (value == null || !Number.isFinite(value)) return "";
      const cents = Math.round(Number(value) * 100);
      return formatFromCents(cents);
    }, [value]);

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const digits = e.target.value.replace(/\D/g, "");
        if (!digits) {
          onChange?.(allowNull ? null : 0);
          return;
        }
        const parsed = Number(digits) / 100;
        onChange?.(parsed);
      },
      [onChange, allowNull],
    );

    return (
      <Input
        {...rest}
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder ?? "0,00 %"}
        value={display}
        onChange={handleChange}
        onBlur={onBlur}
      />
    );
  },
);
PercentageInput.displayName = "PercentageInput";

export { PercentageInput };
