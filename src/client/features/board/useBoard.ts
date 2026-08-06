import { useCallback, useEffect, useState } from "react";
import type { BoardSnapshot } from "../../../shared/api";
import { api } from "../../api/client";

export interface BoardState {
  snapshot: BoardSnapshot | null;
  setSnapshot: React.Dispatch<React.SetStateAction<BoardSnapshot | null>>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useBoard(boardId: string): BoardState {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setSnapshot(await api.snapshot(boardId));
      setError(null);
    } catch {
      setError("Could not load this board.");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  return { snapshot, setSnapshot, loading, error, reload };
}
