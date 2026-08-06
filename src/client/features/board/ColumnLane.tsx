import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ColumnWithCards, CardDto } from "../../../shared/api";
import { CardTile } from "./CardTile";
import { AddCard } from "./AddCard";
import { Dialog, useConfirm } from "../../components/ui";

export function ColumnLane({
  column,
  otherColumns,
  onRename,
  onDelete,
  onAddCard,
  onOpenCard,
}: {
  column: ColumnWithCards;
  otherColumns: ColumnWithCards[];
  onRename: (column: ColumnWithCards, name: string) => void | Promise<void>;
  onDelete: (column: ColumnWithCards, relocateToColumnId?: string) => void | Promise<void>;
  onAddCard: (columnId: string, title: string, files?: File[]) => void | Promise<void>;
  onOpenCard: (card: CardDto) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: "column" },
  });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);
  const [relocating, setRelocating] = useState(false);
  const { confirm, element: confirmEl } = useConfirm();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  async function submitName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== column.name) await onRename(column, trimmed);
    else setName(column.name);
    setEditing(false);
  }

  async function requestDelete() {
    if (column.cards.length === 0) {
      const ok = await confirm({
        title: "Delete column?",
        body: (
          <>
            Delete <strong>{column.name}</strong>?
          </>
        ),
        confirmLabel: "Delete column",
      });
      if (ok) await onDelete(column);
    } else {
      setRelocating(true);
    }
  }

  return (
    <section className="mw-column" ref={setNodeRef} style={style} aria-label={`Column: ${column.name}`}>
      <header className="mw-column__head">
        <button
          className="mw-icon-btn"
          style={{ width: 24, cursor: "grab" }}
          aria-label={`Reorder column ${column.name}`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>

        {editing ? (
          <input
            className="mw-column__name"
            style={{ borderColor: "var(--mw-cyan)" }}
            autoFocus
            value={name}
            aria-label="Column name"
            onChange={(e) => setName(e.target.value)}
            onBlur={submitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitName();
              } else if (e.key === "Escape") {
                setName(column.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button className="mw-column__name" onClick={() => setEditing(true)} title="Rename column">
            {column.name}
          </button>
        )}

        <span className="mw-column__count" aria-label={`${column.cards.length} cards`}>
          {column.cards.length}
        </span>
        <button className="mw-icon-btn" aria-label={`Delete column ${column.name}`} onClick={requestDelete}>
          🗑
        </button>
      </header>

      <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="mw-column__cards">
          {column.cards.map((card) => (
            <CardTile key={card.id} card={card} onOpen={() => onOpenCard(card)} />
          ))}
        </div>
      </SortableContext>

      <footer className="mw-column__foot">
        <AddCard onAdd={(title, files) => onAddCard(column.id, title, files)} />
      </footer>

      {relocating && (
        <RelocateDialog
          column={column}
          targets={otherColumns}
          onClose={() => setRelocating(false)}
          onConfirm={async (targetId) => {
            setRelocating(false);
            await onDelete(column, targetId);
          }}
        />
      )}
      {confirmEl}
    </section>
  );
}

function RelocateDialog({
  column,
  targets,
  onClose,
  onConfirm,
}: {
  column: ColumnWithCards;
  targets: ColumnWithCards[];
  onClose: () => void;
  onConfirm: (targetId: string) => void | Promise<void>;
}) {
  const [target, setTarget] = useState(targets[0]?.id ?? "");

  return (
    <Dialog title="Delete column" onClose={onClose}>
      <div className="mw-stack">
        <p style={{ margin: 0 }}>
          <strong>{column.name}</strong> has {column.cards.length} card
          {column.cards.length === 1 ? "" : "s"}. Choose a column to move them to before deleting.
        </p>
        {targets.length === 0 ? (
          <p className="mw-field__error">Create another column first. Cards need somewhere to go.</p>
        ) : (
          <div className="mw-field">
            <label htmlFor="relocate">Move cards to</label>
            <select
              id="relocate"
              className="mw-select"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {targets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="mw-btn mw-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="mw-btn mw-btn--danger"
            disabled={!target}
            onClick={() => void onConfirm(target)}
          >
            Move &amp; delete
          </button>
        </div>
      </div>
    </Dialog>
  );
}
