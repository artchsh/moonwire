import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Plus } from "lucide-react";
import type { BoardDto } from "../../shared/api";

const ICON = { size: 16, strokeWidth: 1.75 } as const;

export function BoardSwitcher({
  boards,
  selectedBoard,
  onSelect,
  onCreate,
}: {
  boards: BoardDto[];
  selectedBoard: BoardDto | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreate(trimmed);
    setName("");
    setCreating(false);
    setOpen(false);
  }

  return (
    <div className="mw-switcher" ref={ref}>
      <button
        className="mw-switcher__current"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{selectedBoard?.name ?? "Select a board"}</span>
        <ChevronDown {...ICON} aria-hidden="true" />
      </button>

      {open && (
        <div className="mw-menu" role="menu" style={{ marginTop: 6 }}>
          {boards.map((b) => (
            <button
              key={b.id}
              role="menuitemradio"
              aria-checked={b.id === selectedBoard?.id}
              className="mw-menu__item"
              onClick={() => {
                onSelect(b.id);
                setOpen(false);
              }}
            >
              <span style={{ width: 16, display: "inline-flex" }} aria-hidden="true">
                {b.id === selectedBoard?.id && <Check {...ICON} />}
              </span>
              {b.name}
            </button>
          ))}

          <div style={{ height: 1, background: "var(--mw-border)", margin: "6px 0" }} />

          {creating ? (
            <form onSubmit={submitCreate} style={{ padding: 4 }}>
              <input
                className="mw-input"
                autoFocus
                placeholder="Board name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="New board name"
              />
            </form>
          ) : (
            <button className="mw-menu__item" onClick={() => setCreating(true)}>
              <Plus {...ICON} /> New board
            </button>
          )}
        </div>
      )}
    </div>
  );
}
