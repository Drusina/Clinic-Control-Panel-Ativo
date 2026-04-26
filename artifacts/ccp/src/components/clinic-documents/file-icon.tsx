import { File, FileText, Image as ImageIcon, FileSpreadsheet, FileType2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function getFileKind(mime: string | null, fileName: string): "pdf" | "word" | "excel" | "image" | "other" {
  const m = (mime ?? "").toLowerCase();
  const n = fileName.toLowerCase();
  if (m.includes("pdf") || n.endsWith(".pdf")) return "pdf";
  if (
    m.includes("word") ||
    m.includes("officedocument.wordprocessingml") ||
    n.endsWith(".doc") ||
    n.endsWith(".docx")
  ) {
    return "word";
  }
  if (
    m.includes("excel") ||
    m.includes("spreadsheet") ||
    n.endsWith(".xls") ||
    n.endsWith(".xlsx") ||
    n.endsWith(".csv")
  ) {
    return "excel";
  }
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(n)) {
    return "image";
  }
  return "other";
}

const KIND_TO_COLOR: Record<string, string> = {
  pdf: "text-red-500",
  word: "text-blue-500",
  excel: "text-green-600",
  image: "text-purple-500",
  other: "text-muted-foreground",
};

export function FileIcon({
  mime,
  fileName,
  className,
}: {
  mime: string | null;
  fileName: string;
  className?: string;
}) {
  const kind = getFileKind(mime, fileName);
  const colorClass = KIND_TO_COLOR[kind];

  if (kind === "pdf") return <FileText className={cn("h-4 w-4", colorClass, className)} />;
  if (kind === "word") return <FileType2 className={cn("h-4 w-4", colorClass, className)} />;
  if (kind === "excel") return <FileSpreadsheet className={cn("h-4 w-4", colorClass, className)} />;
  if (kind === "image") return <ImageIcon className={cn("h-4 w-4", colorClass, className)} />;
  return <File className={cn("h-4 w-4", colorClass, className)} />;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
