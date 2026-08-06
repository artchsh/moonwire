import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2, Settings as SettingsIcon, UserRound, LogOut } from "lucide-react";
import type { BoardDto } from "../../shared/api";
import { Logo } from "../components/Logo";
import { usePrompt } from "../components/ui";
import { BoardSwitcher } from "./BoardSwitcher";

const ICON = { size: 16, strokeWidth: 1.75 } as const;

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
  const { prompt, element: promptEl } = usePrompt();

  useOutside(menuRef, () => setMenuOpen(false), menuOpen);
  useOutside(userRef, () => setUserMenu(false), userMenu);

  async function rename() {
    if (!selectedBoard) return;
    setMenuOpen(false);
    const next = await prompt({
      title: "Rename board",
      label: "Board name",
      initialValue: selectedBoard.name,
      confirmLabel: "Rename",
    });
    if (next) await onRenameBoard(selectedBoard, next);
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
            <MoreHorizontal {...ICON} />
          </button>
          {menuOpen && (
            <div className="mw-menu" role="menu" style={{ marginTop: 6 }}>
              <button className="mw-menu__item" role="menuitem" onClick={rename}>
                <Pencil {...ICON} /> Rename board
              </button>
              <button
                className="mw-menu__item mw-menu__item--danger"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void onDeleteBoard(selectedBoard);
                }}
              >
                <Trash2 {...ICON} /> Delete board
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mw-topbar__spacer" />

      <button className="mw-btn mw-btn--ghost mw-btn--sm" onClick={onOpenSettings}>
        <SettingsIcon {...ICON} /> Settings
      </button>

      <div className="mw-switcher" ref={userRef}>
        <button
          className="mw-icon-btn"
          aria-label={`Account: ${username}`}
          aria-haspopup="menu"
          aria-expanded={userMenu}
          onClick={() => setUserMenu((o) => !o)}
        >
          <UserRound {...ICON} />
        </button>
        {userMenu && (
          <div className="mw-menu" role="menu" style={{ right: 0, marginTop: 6 }}>
            <div style={{ padding: "6px 10px", color: "var(--mw-text-faint)", fontSize: 12 }}>
              Signed in as {username}
            </div>
            <button className="mw-menu__item" role="menuitem" onClick={onLogout}>
              <LogOut {...ICON} /> Log out
            </button>
          </div>
        )}
      </div>
      {promptEl}
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
