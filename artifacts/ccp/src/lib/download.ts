export function isCrossOriginUrl(url: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.origin !== window.location.origin;
  } catch {
    return true;
  }
}

export function downloadUrl(url: string, fileName: string): void {
  if (typeof window === "undefined") return;

  if (isCrossOriginUrl(url)) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) return;
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.click();
}
