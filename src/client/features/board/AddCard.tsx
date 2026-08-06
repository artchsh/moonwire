import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { imageFilesFromClipboard } from "../attachments/clipboard";

interface Pasted {
  file: File;
  url: string;
}

export function AddCard({
  onAdd,
}: {
  onAdd: (title: string, files: File[]) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [images, setImages] = useState<Pasted[]>([]);
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Revoke object URLs only when the editor unmounts (not on every change).
  const imagesRef = useRef<Pasted[]>([]);
  imagesRef.current = images;
  useEffect(() => () => imagesRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  function reset() {
    images.forEach((i) => URL.revokeObjectURL(i.url));
    setImages([]);
    setValue("");
    setEditing(false);
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = imageFilesFromClipboard(e);
    if (files.length === 0) return;
    e.preventDefault(); // don't dump image metadata into the title
    setImages((prev) => [...prev, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
    taRef.current?.focus();
  }

  async function submit() {
    const title = value.trim();
    if (!title) {
      // Keep the editor open if the user pasted images but hasn't titled the card.
      if (images.length > 0) {
        taRef.current?.focus();
        return;
      }
      reset();
      return;
    }
    setBusy(true);
    try {
      await onAdd(title, images.map((i) => i.file));
      images.forEach((i) => URL.revokeObjectURL(i.url));
      setImages([]);
      setValue("");
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  // Don't submit when focus moves to a control inside this editor (e.g. a
  // preview's remove button) — only when focus truly leaves it.
  function onBlur(e: React.FocusEvent) {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    void submit();
  }

  if (!editing) {
    return (
      <button className="mw-add-tile" onClick={() => setEditing(true)}>
        <Plus size={15} strokeWidth={1.75} /> Add card
      </button>
    );
  }

  return (
    <div className="mw-add-card" ref={containerRef} onBlur={onBlur}>
      <textarea
        ref={taRef}
        className="mw-inline-input"
        autoFocus
        rows={2}
        placeholder="Card title…"
        aria-label="New card title"
        aria-describedby="mw-add-card-hint"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            reset();
          }
        }}
      />

      {images.length > 0 && (
        <div className="mw-add-previews">
          {images.map((img, i) => (
            <div className="mw-add-preview" key={img.url}>
              <img src={img.url} alt={`Pasted image ${i + 1}`} />
              <button
                type="button"
                className="mw-add-preview__del"
                aria-label={`Remove pasted image ${i + 1}`}
                onClick={() => removeImage(i)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <p id="mw-add-card-hint" className="mw-add-card__hint">
        {images.length > 0
          ? `${images.length} image${images.length === 1 ? "" : "s"} will be attached · Enter to add`
          : "Paste an image (Ctrl/⌘+V) to attach it · Enter to add"}
      </p>
    </div>
  );
}
