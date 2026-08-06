import { useState } from "react";
import { X } from "lucide-react";
import type { AttachmentDto } from "../../../shared/api";
import { api } from "../../api/client";
import { ImageViewer } from "./ImageViewer";
import { useConfirm, useToast } from "../../components/ui";

export function AttachmentGallery({
  attachments,
  onChanged,
}: {
  attachments: AttachmentDto[];
  onChanged: () => void | Promise<void>;
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const { confirm, element: confirmEl } = useConfirm();
  const toast = useToast();

  async function remove(a: AttachmentDto) {
    const ok = await confirm({
      title: "Delete image?",
      body: (
        <>
          Delete <strong>{a.filename}</strong>? This removes the file permanently.
        </>
      ),
      confirmLabel: "Delete image",
    });
    if (!ok) return;
    await api.deleteAttachment(a.id);
    toast.push("Image deleted");
    await onChanged();
  }

  if (attachments.length === 0) {
    return <p style={{ color: "var(--mw-text-faint)", fontSize: 13, margin: 0 }}>No images yet.</p>;
  }

  return (
    <>
      <div className="mw-gallery">
        {attachments.map((a, i) => (
          <div className="mw-gallery__item" key={a.id}>
            <img
              src={a.thumbnailUrl}
              alt={a.filename}
              loading="lazy"
              onClick={() => setViewerIndex(i)}
              onKeyDown={(e) => e.key === "Enter" && setViewerIndex(i)}
              tabIndex={0}
              role="button"
              aria-label={`View ${a.filename}`}
            />
            <button className="mw-gallery__del" aria-label={`Delete ${a.filename}`} onClick={() => void remove(a)}>
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>

      {viewerIndex !== null && (
        <ImageViewer attachments={attachments} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
      {confirmEl}
    </>
  );
}
