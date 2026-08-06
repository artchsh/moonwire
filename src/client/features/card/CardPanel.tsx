import { useEffect, useRef, useState } from "react";
import { X, Trash2, Circle, CheckCircle2 } from "lucide-react";
import type { CardDto } from "../../../shared/api";
import { renderMarkdown } from "../../components/markdown";
import { useConfirm, useToast } from "../../components/ui";
import { api } from "../../api/client";
import { AttachmentGallery } from "../attachments/AttachmentGallery";
import { ImageUploader } from "../attachments/ImageUploader";
import { imageFilesFromClipboard } from "../attachments/clipboard";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function CardPanel({
  card,
  onClose,
  onUpdate,
  onDelete,
  onAttachmentsChanged,
}: {
  card: CardDto;
  onClose: () => void;
  onUpdate: (card: CardDto, patch: { title?: string; description?: string; completed?: boolean }) => Promise<CardDto | null>;
  onDelete: (card: CardDto) => void | Promise<void>;
  onAttachmentsChanged: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [editingDesc, setEditingDesc] = useState(false);
  const [pasting, setPasting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { confirm, element: confirmEl } = useConfirm();
  const toast = useToast();

  // Paste an image anywhere in the open card to attach it immediately.
  async function onPaste(e: React.ClipboardEvent) {
    const files = imageFilesFromClipboard(e);
    if (files.length === 0) return; // let text paste through normally
    e.preventDefault();
    setPasting(true);
    try {
      const result = await api.uploadAttachments(card.id, files);
      if (result.errors.length > 0) {
        toast.push(`${result.errors.length} image(s) could not be attached.`, "error");
      }
      if (result.attachments.length > 0) {
        toast.push(`Added ${result.attachments.length} image(s).`);
        await onAttachmentsChanged();
      }
    } finally {
      setPasting(false);
    }
  }

  // Re-sync when a different card is opened.
  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description);
    setEditingDesc(false);
  }, [card.id]);

  // Focus trap + Escape.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && node) {
        const items = node.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  async function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(card.title);
      return;
    }
    if (trimmed !== card.title) await onUpdate(card, { title: trimmed });
  }

  async function saveDescription() {
    setEditingDesc(false);
    if (description !== card.description) await onUpdate(card, { description });
  }

  async function requestDelete() {
    const ok = await confirm({
      title: "Delete card?",
      body: (
        <>
          Delete <strong>{card.title}</strong> and its images? This cannot be undone.
        </>
      ),
      confirmLabel: "Delete card",
    });
    if (ok) await onDelete(card);
  }

  return (
    <>
      <div className="mw-panel-scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="mw-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Card: ${card.title}`}
        ref={ref}
        onPaste={onPaste}
      >
      <div className="mw-panel__head">
        <button
          type="button"
          className={`mw-complete-btn${card.completed ? " mw-complete-btn--on" : ""}`}
          aria-pressed={card.completed}
          onClick={() => void onUpdate(card, { completed: !card.completed })}
        >
          {card.completed ? <CheckCircle2 size={16} strokeWidth={2} /> : <Circle size={16} strokeWidth={1.75} />}
          {card.completed ? "Completed" : "Mark complete"}
        </button>
        <div style={{ flex: 1 }} />
        <button className="mw-icon-btn" aria-label="Delete card" onClick={requestDelete}>
          <Trash2 size={18} strokeWidth={1.75} />
        </button>
        <button className="mw-icon-btn" aria-label="Close card" onClick={onClose}>
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className="mw-panel__title-row">
        <input
          className="mw-panel__title-input"
          value={title}
          aria-label="Card title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>

      <div className="mw-panel__body">
        <section className="mw-stack" style={{ gap: 8 }}>
          <div className="mw-label">Description · Markdown</div>
          {editingDesc ? (
            <textarea
              className="mw-textarea"
              autoFocus
              value={description}
              aria-label="Card description (Markdown)"
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              placeholder="Write a description in Markdown…"
            />
          ) : description.trim() ? (
            <div
              className="mw-markdown"
              onClick={() => setEditingDesc(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setEditingDesc(true)}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: renderMarkdown(description) }}
            />
          ) : (
            <button className="mw-add-tile" onClick={() => setEditingDesc(true)}>
              Add a description…
            </button>
          )}
        </section>

        <section className="mw-stack" style={{ gap: 8 }}>
          <div className="mw-label">Images{pasting ? " · adding…" : ""}</div>
          <AttachmentGallery attachments={card.attachments} onChanged={onAttachmentsChanged} />
          <ImageUploader cardId={card.id} onUploaded={onAttachmentsChanged} />
          <p className="mw-add-card__hint">Or paste an image (Ctrl/⌘+V) anywhere in this card.</p>
        </section>
      </div>
      {confirmEl}
      </div>
    </>
  );
}
