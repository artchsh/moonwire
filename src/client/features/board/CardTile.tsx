import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Circle, StickyNote } from "lucide-react";
import type { CardDto } from "../../../shared/api";

// Memoized: a card only re-renders when its own data (or drag state) changes,
// not when a sibling card or another column updates. Callbacks are stable
// (they receive the card), so shallow prop comparison holds.
export const CardTile = memo(function CardTile({
  card,
  onOpen,
  onToggleComplete,
}: {
  card: CardDto;
  onOpen: (card: CardDto) => void;
  onToggleComplete: (card: CardDto) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", columnId: card.columnId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const thumbs = card.attachments.slice(0, 3);
  const extra = card.attachments.length - thumbs.length;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      onOpen(card);
      return;
    }
    (listeners as Record<string, ((e: React.KeyboardEvent) => void) | undefined>)?.onKeyDown?.(e);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={() => onOpen(card)}
      className={`mw-card${isDragging ? " mw-card--dragging" : ""}${card.completed ? " mw-card--done" : ""}`}
      aria-label={`Card: ${card.title}${card.completed ? " (completed)" : ""}. Press Enter to open.`}
    >
      <div className="mw-card__row">
        <button
          type="button"
          className={`mw-check${card.completed ? " mw-check--on" : ""}`}
          aria-label={card.completed ? "Mark as not complete" : "Mark as complete"}
          aria-pressed={card.completed}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete(card);
          }}
        >
          {card.completed ? <Check size={13} strokeWidth={3} /> : <Circle size={16} strokeWidth={1.75} />}
        </button>
        <div className="mw-card__title">{card.title}</div>
      </div>

      {card.attachments.length > 0 && (
        <div className="mw-card__thumbs">
          {thumbs.map((a) => (
            <img
              key={a.id}
              className="mw-card__thumb"
              src={a.thumbnailUrl}
              alt={a.filename}
              loading="lazy"
              draggable={false}
            />
          ))}
          {extra > 0 && <span className="mw-card__thumb-more">+{extra}</span>}
        </div>
      )}

      {card.description.trim() && (
        <div className="mw-card__meta">
          <StickyNote size={13} strokeWidth={1.75} aria-hidden="true" /> Notes
        </div>
      )}
    </div>
  );
});
