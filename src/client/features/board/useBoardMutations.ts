import { useCallback } from "react";
import type { BoardSnapshot, CardDto, ColumnWithCards } from "../../../shared/api";
import { api, ApiClientError } from "../../api/client";
import { useToast } from "../../components/ui";
import type { BoardState } from "./useBoard";
import type { CardMove, ColumnMove } from "./drag";

export function useBoardMutations(state: BoardState, boardId: string) {
  const { snapshot, setSnapshot, reload } = state;
  const toast = useToast();

  const onConflict = useCallback(
    async (err: unknown, fallback: string) => {
      if (err instanceof ApiClientError && err.status === 409) {
        toast.push("Loaded newer board state. Please retry.", "error");
      } else {
        toast.push(fallback, "error");
      }
      await reload();
    },
    [reload, toast],
  );

  const addColumn = useCallback(
    async (name: string) => {
      try {
        const column = await api.createColumn(boardId, name);
        setSnapshot((s) => (s ? { ...s, columns: [...s.columns, { ...column, cards: [] }] } : s));
      } catch {
        toast.push("Could not add column.", "error");
      }
    },
    [boardId, setSnapshot, toast],
  );

  const renameColumn = useCallback(
    async (column: ColumnWithCards, name: string) => {
      setSnapshot((s) =>
        s ? { ...s, columns: s.columns.map((c) => (c.id === column.id ? { ...c, name } : c)) } : s,
      );
      try {
        const updated = await api.updateColumn(column.id, column.version, name);
        setSnapshot((s) =>
          s
            ? { ...s, columns: s.columns.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)) }
            : s,
        );
      } catch (err) {
        await onConflict(err, "Could not rename column.");
      }
    },
    [setSnapshot, onConflict],
  );

  const deleteColumn = useCallback(
    async (column: ColumnWithCards, relocateToColumnId?: string) => {
      try {
        await api.deleteColumn(column.id, relocateToColumnId);
        await reload();
      } catch (err) {
        await onConflict(err, "Could not delete column.");
      }
    },
    [reload, onConflict],
  );

  const addCard = useCallback(
    async (columnId: string, title: string, files: File[] = []) => {
      try {
        const card = await api.createCard(columnId, title);
        let finalCard = card;
        if (files.length > 0) {
          const result = await api.uploadAttachments(card.id, files);
          if (result.errors.length > 0) {
            toast.push(`${result.errors.length} image(s) could not be attached.`, "error");
          }
          if (result.attachments.length > 0) {
            finalCard = { ...card, attachments: result.attachments };
          }
        }
        setSnapshot((s) =>
          s
            ? {
                ...s,
                columns: s.columns.map((c) =>
                  c.id === columnId ? { ...c, cards: [...c.cards, finalCard] } : c,
                ),
              }
            : s,
        );
      } catch {
        toast.push("Could not add card.", "error");
      }
    },
    [setSnapshot, toast],
  );

  const updateCard = useCallback(
    async (card: CardDto, patch: { title?: string; description?: string; completed?: boolean }): Promise<CardDto | null> => {
      try {
        const updated = await api.updateCard(card.id, card.version, patch);
        setSnapshot((s) => replaceCard(s, updated));
        return updated;
      } catch (err) {
        await onConflict(err, "Could not save changes.");
        return null;
      }
    },
    [setSnapshot, onConflict],
  );

  const toggleComplete = useCallback(
    async (card: CardDto) => {
      const next = !card.completed;
      setSnapshot((s) => replaceCard(s, { ...card, completed: next })); // optimistic
      try {
        const updated = await api.updateCard(card.id, card.version, { completed: next });
        setSnapshot((s) => replaceCard(s, updated));
      } catch (err) {
        await onConflict(err, "Could not update card.");
      }
    },
    [setSnapshot, onConflict],
  );

  const deleteCard = useCallback(
    async (card: CardDto) => {
      try {
        await api.deleteCard(card.id);
        setSnapshot((s) =>
          s
            ? { ...s, columns: s.columns.map((c) => ({ ...c, cards: c.cards.filter((k) => k.id !== card.id) })) }
            : s,
        );
      } catch (err) {
        await onConflict(err, "Could not delete card.");
      }
    },
    [setSnapshot, onConflict],
  );

  const persistCardMove = useCallback(
    async (move: CardMove) => {
      setSnapshot(move.next); // optimistic — the drop is already on screen
      try {
        // Reconcile just the moved card's version from the response; no full
        // refetch, so the drag feels instant.
        const updated = await api.moveCard(
          move.cardId,
          move.version,
          move.toColumnId,
          move.beforeId,
          move.afterId,
        );
        setSnapshot((s) => replaceCard(s, updated));
      } catch (err) {
        await onConflict(err, "Could not move card.");
      }
    },
    [setSnapshot, onConflict],
  );

  const persistColumnMove = useCallback(
    async (move: ColumnMove) => {
      setSnapshot(move.next); // optimistic
      try {
        const updated = await api.moveColumn(move.columnId, move.version, move.beforeId, move.afterId);
        setSnapshot((s) =>
          s ? { ...s, columns: s.columns.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)) } : s,
        );
      } catch (err) {
        await onConflict(err, "Could not move column.");
      }
    },
    [setSnapshot, onConflict],
  );

  return {
    snapshot,
    addColumn,
    renameColumn,
    deleteColumn,
    addCard,
    updateCard,
    deleteCard,
    toggleComplete,
    persistCardMove,
    persistColumnMove,
  };
}

function replaceCard(s: BoardSnapshot | null, updated: CardDto): BoardSnapshot | null {
  if (!s) return s;
  return {
    ...s,
    columns: s.columns.map((c) => ({
      ...c,
      cards: c.cards.map((k) => (k.id === updated.id ? updated : k)),
    })),
  };
}
