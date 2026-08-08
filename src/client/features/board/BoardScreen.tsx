import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  MeasuringStrategy,
  closestCorners,
  pointerWithin,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type DropAnimation,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import type { BoardSnapshot, CardDto, ColumnWithCards } from "../../../shared/api";
import { useBoard } from "./useBoard";
import { useBoardMutations } from "./useBoardMutations";
import { Check, Circle } from "lucide-react";
import { ColumnLane } from "./ColumnLane";
import { CardTileBody } from "./CardTile";
import { AddColumn } from "./AddColumn";
import { finalizeCardMove, moveColumnInSnapshot, previewCardMove } from "./drag";
import { CardPanel } from "../card/CardPanel";
import { Skeleton } from "../../components/ui";

// Prefer the droppable actually under the pointer; corner distance alone can
// resolve to a neighbouring column mid-flight and teleport the card there.
// closestCorners remains the fallback for pointers outside any droppable
// (e.g. in the gap between columns).
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCorners(args);
};

// Glide the overlay into the card's final slot on drop; hide the placeholder
// card underneath while the overlay is in flight so there is no double image.
const dropAnimation: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0" } },
  }),
};

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
  const { setSnapshot } = state;

  // Stable identity while the column set is unchanged: dnd-kit compares its
  // `items` prop by reference and zeroes transitions when it changes.
  const columnIds = useMemo(() => (snapshot?.columns ?? []).map((c) => c.id), [snapshot?.columns]);

  // Snapshot as it was when the drag started, so a cancelled drag (or a drop
  // outside any column) can undo the live cross-column preview.
  const dragOriginRef = useRef<BoardSnapshot | null>(null);

  function onDragStart(e: DragStartEvent) {
    state.syncPausedRef.current = true;
    dragOriginRef.current = snapshot;
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

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over || active.data.current?.type !== "card") return;
    // Preview cross-column moves live so the target column's cards animate
    // apart while dragging, and the drop animation lands in the right slot.
    setSnapshot((s) => (s ? previewCardMove(s, String(active.id), String(over.id)) ?? s : s));
  }

  function onDragCancel() {
    state.syncPausedRef.current = false;
    setActiveCard(null);
    if (dragOriginRef.current) setSnapshot(dragOriginRef.current);
    dragOriginRef.current = null;
  }

  function onDragEnd(e: DragEndEvent) {
    state.syncPausedRef.current = false;
    setActiveCard(null);
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;
    const { active, over } = e;
    if (!snapshot) return;
    const type = active.data.current?.type;

    if (type === "column") {
      if (!over) return;
      const move = moveColumnInSnapshot(snapshot, String(active.id), String(over.id));
      if (move) void m.persistColumnMove(move);
    } else if (type === "card") {
      if (!over) {
        // Dropped outside any target: undo the live preview.
        if (origin) setSnapshot(origin);
        return;
      }
      const { move } = finalizeCardMove(origin ?? snapshot, snapshot, String(active.id), String(over.id));
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
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="mw-board">
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
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

        <DragOverlay dropAnimation={dropAnimation}>
          {activeCard ? (
            <div className="mw-card mw-card--overlay">
              <div className="mw-card__row">
                <span className={`mw-check${activeCard.completed ? " mw-check--on" : ""}`} aria-hidden="true">
                  {activeCard.completed ? (
                    <Check size={13} strokeWidth={3} />
                  ) : (
                    <Circle size={16} strokeWidth={1.75} />
                  )}
                </span>
                <div className="mw-card__title">{activeCard.title}</div>
              </div>
              <CardTileBody card={activeCard} />
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
