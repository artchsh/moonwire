import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import type { CardDto, ColumnWithCards } from "../../../shared/api";
import { useBoard } from "./useBoard";
import { useBoardMutations } from "./useBoardMutations";
import { ColumnLane } from "./ColumnLane";
import { AddColumn } from "./AddColumn";
import { moveCardInSnapshot, moveColumnInSnapshot } from "./drag";
import { CardPanel } from "../card/CardPanel";
import { Skeleton } from "../../components/ui";

export function BoardScreen({ boardId }: { boardId: string }) {
  const state = useBoard(boardId);
  const m = useBoardMutations(state, boardId);
  const [activeCard, setActiveCard] = useState<CardDto | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  // Stable handlers so memoized ColumnLane/CardTile don't re-render on unrelated updates.
  const handleOpenCard = useCallback((card: CardDto) => setOpenCardId(card.id), []);
  const columnsRef = useRef<ColumnWithCards[]>([]);
  useEffect(() => {
    columnsRef.current = m.snapshot?.columns ?? [];
  }, [m.snapshot]);
  const getOtherColumns = useCallback(
    (columnId: string) => columnsRef.current.filter((c) => c.id !== columnId),
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const snapshot = m.snapshot;

  function onDragStart(e: DragStartEvent) {
    const type = e.active.data.current?.type;
    if (type === "card" && snapshot) {
      for (const col of snapshot.columns) {
        const card = col.cards.find((c) => c.id === e.active.id);
        if (card) {
          setActiveCard(card);
          break;
        }
      }
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = e;
    if (!over || !snapshot) return;
    const type = active.data.current?.type;

    if (type === "column") {
      const move = moveColumnInSnapshot(snapshot, String(active.id), String(over.id));
      if (move) void m.persistColumnMove(move);
    } else if (type === "card") {
      const move = moveCardInSnapshot(snapshot, String(active.id), String(over.id));
      if (move) void m.persistCardMove(move);
    }
  }

  if (state.loading && !snapshot) {
    return (
      <div className="mw-board">
        {[0, 1, 2].map((i) => (
          <div className="mw-column" key={i} style={{ padding: 12, gap: 8 }}>
            <Skeleton height={20} width={120} />
            <Skeleton height={54} />
            <Skeleton height={54} />
          </div>
        ))}
      </div>
    );
  }

  if (state.error || !snapshot) {
    return (
      <div className="mw-empty">
        <p>{state.error ?? "Board unavailable."}</p>
        <button className="mw-btn" onClick={() => void state.reload()}>
          Retry
        </button>
      </div>
    );
  }

  const openCard =
    (openCardId && snapshot.columns.flatMap((c) => c.cards).find((c) => c.id === openCardId)) || null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveCard(null)}
      >
        <div className="mw-board">
          <SortableContext
            items={snapshot.columns.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            {snapshot.columns.map((column) => (
              <ColumnLane
                key={column.id}
                column={column}
                getOtherColumns={getOtherColumns}
                onRename={m.renameColumn}
                onDelete={m.deleteColumn}
                onAddCard={m.addCard}
                onOpenCard={handleOpenCard}
                onToggleComplete={m.toggleComplete}
              />
            ))}
          </SortableContext>

          <AddColumn onAdd={m.addColumn} />
        </div>

        <DragOverlay>
          {activeCard ? (
            <div className="mw-card" style={{ cursor: "grabbing" }}>
              <div className="mw-card__title">{activeCard.title}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {openCard && (
        <CardPanel
          card={openCard}
          onClose={() => setOpenCardId(null)}
          onUpdate={m.updateCard}
          onDelete={async (card) => {
            await m.deleteCard(card);
            setOpenCardId(null);
          }}
          onAttachmentsChanged={() => void state.reload()}
        />
      )}
    </>
  );
}
