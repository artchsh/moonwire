import { useEffect, useRef, useState } from "react";
import type { BoardDto } from "../../shared/api";
import { Logo } from "../components/Logo";
import { BoardSwitcher } from "./BoardSwitcher";

export function TopBar({
  boards,
  selectedBoard,
  username,
  onSelectBoard,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  onOpenSettings,
  onLogout,
}: {
  boards: BoardDto[];
  selectedBoard: BoardDto | null;
  username: string;
  onSelectBoard: (id: string) => void;
  onCreateBoard: (name: string) => void | Promise<void>;
  onRenameBoard: (board: BoardDto, name: string) => void | Promise<void>;
  onDeleteBoard: (board: BoardDto) => void | Promise<void>;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useOutside(menuRef, () => setMenuOpen(false), menuOpen);
  useOutside(userRef, () => setUserMenu(false), userMenu);

  function rename() {
    if (!selectedBoard) return;
    const next = window.prompt("Rename board", selectedBoard.name);
    if (next && next.trim()) void onRenameBoard(selectedBoard, next.trim());
    setMenuOpen(false);
  }

  return (
    <header className="mw-topbar">
      <Logo />
      <BoardSwitcher
        boards={boards}
        selectedBoard={selectedBoard}
        onSelect={onSelectBoard}
        onCreate={onCreateBoard}
      />

      {selectedBoard && (
        <div className="mw-switcher" ref={menuRef}>
          <button
            className="mw-icon-btn"
            aria-label="Board actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="mw-menu" role="menu" style={{ marginTop: 6 }}>
              <button className="mw-menu__item" role="menuitem" onClick={rename}>
                Rename board
              </button>
              <button
                className="mw-menu__item mw-menu__item--danger"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void onDeleteBoard(selectedBoard);
                }}
              >
                Delete board
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mw-topbar__spacer" />

      <button className="mw-btn mw-btn--ghost mw-btn--sm" onClick={onOpenSettings}>
        Settings
      </button>

      <div className="mw-switcher" ref={userRef}>
        <button
          className="mw-icon-btn"
          aria-label={`Account: ${username}`}
          aria-haspopup="menu"
          aria-expanded={userMenu}
          onClick={() => setUserMenu((o) => !o)}
        >
          ◐
        </button>
        {userMenu && (
          <div className="mw-menu" role="menu" style={{ right: 0, marginTop: 6 }}>
            <div style={{ padding: "6px 10px", color: "var(--mw-text-faint)", fontSize: 12 }}>
              Signed in as {username}
            </div>
            <button className="mw-menu__item" role="menuitem" onClick={onLogout}>
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function useOutside(ref: React.RefObject<HTMLElement | null>, close: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, close, active]);
}
