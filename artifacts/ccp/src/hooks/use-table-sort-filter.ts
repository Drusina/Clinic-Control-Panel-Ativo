import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/**
 * Generic in-memory sort + text filter for client-side tables.
 *
 * - `searchFields(item)` returns strings to match against the search query
 *   (concatenated, case/accent-insensitive substring).
 * - `getSortValue(item, key)` returns the comparable value for sort.
 *   Strings compare with localeCompare (pt-BR), numbers/dates compare numerically,
 *   booleans compare as numbers, null/undefined sort last.
 */
export function useTableSortFilter<T, K extends string>(
  items: T[],
  options: {
    initialSort: SortState<K>;
    searchFields: (item: T) => Array<string | null | undefined>;
    getSortValue: (item: T, key: K) => string | number | boolean | Date | null | undefined;
  },
) {
  const [sort, setSort] = useState<SortState<K>>(options.initialSort);
  const [search, setSearch] = useState("");

  const toggleSort = (key: K) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    if (!q) return items;
    return items.filter((item) => {
      const hay = options
        .searchFields(item)
        .filter((s): s is string => !!s)
        .map(normalize)
        .join(" \u0000 ");
      return hay.includes(q);
    });
  }, [items, search, options]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    const sign = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const va = options.getSortValue(a, key);
      const vb = options.getSortValue(b, key);
      const aNull = va === null || va === undefined || va === "";
      const bNull = vb === null || vb === undefined || vb === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb, "pt-BR", { sensitivity: "base" }) * sign;
      }
      if (va instanceof Date && vb instanceof Date) {
        return (va.getTime() - vb.getTime()) * sign;
      }
      const na = typeof va === "boolean" ? Number(va) : (va as number);
      const nb = typeof vb === "boolean" ? Number(vb) : (vb as number);
      return (na - nb) * sign;
    });
    return arr;
  }, [filtered, sort, options]);

  return { sort, toggleSort, search, setSearch, items: sorted };
}
