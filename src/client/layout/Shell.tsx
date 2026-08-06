import { useCallback, useEffect, useState } from "react";
import type { BoardDto } from "../../shared/api";
import { api } from "../api/client";
import { TopBar } from "./TopBar";
import { SettingsDialog } from "./SettingsDialog";
import { BoardScreen } from "../features/board/BoardScreen";
import { useToast, useConfirm } from "../components/ui";

const LAST_BOARD_KEY = "mw:lastBoard";

export function Shell({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [boards, setBoards] = useState<BoardDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toast = useToast();
  const { confirm, element: confirmEl } = useConfirm();

  const loadBoards = useCallback(async () => {
    const { boards } = await api.listBoards();
    setBoards(boards);
    setSelectedId((current) => {
      if (current && boards.some((b) => b.id === current)) return current;
      const remembered = localStorage.getItem(LAST_BOARD_KEY);
      if (remembered && boards.some((b) => b.id === remembered)) return remembered;
      return boards[0]?.id ?? null;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    if (selectedId) localStorage.setItem(LAST_BOARD_KEY, selectedId);
  }, [selectedId]);

  const selectBoard = (id: string) => setSelectedId(id);

  async function createBoard(name: string) {
    const board = await api.createBoard(name);
    setBoards((prev) => [...prev, board]);
    setSelectedId(board.id);
    toast.push(`Board “${board.name}” created`);
  }

  async function renameBoard(board: BoardDto, name: string) {
    const updated = await api.updateBoard(board.id, board.version, name);
    setBoards((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }

  async function deleteBoard(board: BoardDto) {
    const ok = await confirm({
      title: "Delete board?",
      body: (
        <>
          Delete <strong>{board.name}</strong> and all of its columns, cards, and images? This cannot
          be undone.
        </>
      ),
      confirmLabel: "Delete board",
    });
    if (!ok) return;
    await api.deleteBoard(board.id);
    setBoards((prev) => prev.filter((b) => b.id !== board.id));
    setSelectedId((prev) => (prev === board.id ? null : prev));
    toast.push(`Board “${board.name}” deleted`);
  }

  const selectedBoard = boards.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="mw-app">
      <TopBar
        boards={boards}
        selectedBoard={selectedBoard}
        username={username}
        onSelectBoard={selectBoard}
        onCreateBoard={createBoard}
        onRenameBoard={renameBoard}
        onDeleteBoard={deleteBoard}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={onLogout}
      />

      {loading ? (
        <div className="mw-empty">Loading boards…</div>
      ) : selectedBoard ? (
        <BoardScreen key={selectedBoard.id} boardId={selectedBoard.id} />
      ) : (
        <div className="mw-empty">
          <div>
            <h2>No boards yet</h2>
            <p style={{ color: "var(--mw-text-muted)" }}>Create your first board to get going.</p>
          </div>
          <button className="mw-btn mw-btn--primary" onClick={() => void createBoard("My board")}>
            Create a board
          </button>
        </div>
      )}

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {confirmEl}
    </div>
  );
}
