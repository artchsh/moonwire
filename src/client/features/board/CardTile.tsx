import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CardDto } from "../../../shared/api";

export function CardTile({ card, onOpen }: { card: CardDto; onOpen: () => void }) {
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
      onOpen();
      return;
    }
    // Preserve dnd-kit keyboard drag activation (Space) and arrow handling.
    (listeners as Record<string, ((e: React.KeyboardEvent) => void) | undefined>)?.onKeyDown?.(e);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={onOpen}
      className={`mw-card${isDragging ? " mw-card--dragging" : ""}`}
      aria-label={`Card: ${card.title}. Press Enter to open.`}
    >
      <div className="mw-card__title">{card.title}</div>

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
          <span aria-hidden="true">≡</span> Notes
        </div>
      )}
    </div>
  );
}
