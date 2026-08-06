import { useEffect, useState } from "react";
import type { AttachmentDto } from "../../../shared/api";

export function ImageViewer({
  attachments,
  startIndex,
  onClose,
}: {
  attachments: AttachmentDto[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const current = attachments[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setIndex((i) => (i + 1) % attachments.length);
      else if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + attachments.length) % attachments.length);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [attachments.length, onClose]);

  if (!current) return null;

  return (
    <div
      className="mw-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`Image ${index + 1} of ${attachments.length}: ${current.filename}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <button className="mw-icon-btn mw-viewer__close" onClick={onClose} aria-label="Close viewer">
        ✕
      </button>

      {attachments.length > 1 && (
        <>
          <button
            className="mw-viewer__nav mw-viewer__nav--prev"
            aria-label="Previous image"
            onClick={() => setIndex((i) => (i - 1 + attachments.length) % attachments.length)}
          >
            ‹
          </button>
          <button
            className="mw-viewer__nav mw-viewer__nav--next"
            aria-label="Next image"
            onClick={() => setIndex((i) => (i + 1) % attachments.length)}
          >
            ›
          </button>
        </>
      )}

      <img src={current.contentUrl} alt={current.filename} />
    </div>
  );
}
