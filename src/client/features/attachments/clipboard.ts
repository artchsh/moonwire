/** Extract image files from a paste event, naming unnamed clipboard blobs. */
export function imageFilesFromClipboard(e: React.ClipboardEvent): File[] {
  const items = e.clipboardData?.items;
  if (!items) return [];
  const files: File[] = [];
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const raw = item.getAsFile();
      if (raw) {
        const ext = item.type.split("/")[1] || "png";
        files.push(raw.name ? raw : new File([raw], `pasted-${Date.now()}.${ext}`, { type: item.type }));
      }
    }
  }
  return files;
}
