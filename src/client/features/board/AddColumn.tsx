import { useState } from "react";
import { Plus } from "lucide-react";

export function AddColumn({ onAdd }: { onAdd: (name: string) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  async function submit() {
    const name = value.trim();
    if (name) await onAdd(name);
    setValue("");
    setEditing(false);
  }

  return (
    <div className="mw-add-column">
      {editing ? (
        <input
          className="mw-inline-input"
          autoFocus
          placeholder="Column name…"
          aria-label="New column name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape") {
              setValue("");
              setEditing(false);
            }
          }}
        />
      ) : (
        <button className="mw-add-tile" onClick={() => setEditing(true)}>
          <Plus size={15} strokeWidth={1.75} /> Add column
        </button>
      )}
    </div>
  );
}
