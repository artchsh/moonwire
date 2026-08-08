import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardSnapshot } from "../../../shared/api";
import { api, clientId } from "../../api/client";
import { applyBoardEvents } from "./applyEvents";

/** How often to ask the server for changes made by other clients. */
const SYNC_INTERVAL_MS = 3000;

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

  // The sync-stream position our snapshot reflects. A ref (not state) so the
  // poll loop always reads the latest value without re-arming its interval.
  const revisionRef = useRef(0);

  const reload = useCallback(async () => {
    try {
      const next = await api.snapshot(boardId);
      revisionRef.current = next.revision;
      setSnapshot(next);
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

  // Poll the board's change log so edits from other tabs/users/agents appear
  // without a manual refresh. Our own mutations are skipped via clientId.
  useEffect(() => {
    let stopped = false;
    let inFlight = false;

    const tick = async () => {
      if (stopped || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const res = await api.boardEvents(boardId, revisionRef.current);
        if (stopped) return;
        if (res.resync) {
          await reload();
          return;
        }
        if (res.events.length === 0) {
          revisionRef.current = res.revision;
          return;
        }
        let needsResync = false;
        setSnapshot((s) => {
          if (!s) return s;
          const { snapshot: applied, resync } = applyBoardEvents(s, res.events, clientId);
          if (resync) {
            needsResync = true;
            return s;
          }
          revisionRef.current = res.revision;
          return { ...applied, revision: res.revision };
        });
        if (needsResync) await reload();
      } catch {
        // Transient network/auth errors resolve themselves on a later tick;
        // a deleted board keeps 404ing until the user navigates away.
      } finally {
        inFlight = false;
      }
    };

    const interval = setInterval(() => void tick(), SYNC_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [boardId, reload]);

  return { snapshot, setSnapshot, loading, error, reload };
}
