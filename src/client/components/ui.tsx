import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: number | string }) {
  return <div className="mw-skeleton" style={{ height, width }} aria-hidden="true" />;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** Accessible modal dialog: focus trap, Escape to close, focus restoration. */
export function Dialog({
  title,
  onClose,
  children,
  labelledBy,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = node?.querySelectorAll<HTMLElement>(FOCUSABLE);
    focusables?.[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && node) {
        const items = node.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="mw-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="mw-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        ref={ref}
      >
        {title && (
          <div className="mw-dialog__head">
            <h2 className="mw-dialog__title" id={titleId}>
              {title}
            </h2>
            <button className="mw-icon-btn" onClick={onClose} aria-label="Close dialog">
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ---- Toasts ----

interface Toast {
  id: number;
  message: string;
  type: "info" | "error";
}
interface ToastApi {
  push: (message: string, type?: "info" | "error") => void;
}
const ToastContext = createContext<ToastApi>({ push: () => {} });
export const useToast = () => useContext(ToastContext);

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, type: "info" | "error" = "info") => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="mw-toasts" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`mw-toast${t.type === "error" ? " mw-toast--error" : ""}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Simple confirm dialog controller. */
export function useConfirm() {
  const [state, setState] = useState<{
    title: string;
    body: ReactNode;
    confirmLabel: string;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (opts: { title: string; body: ReactNode; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) =>
        setState({ ...opts, confirmLabel: opts.confirmLabel ?? "Confirm", resolve }),
      ),
    [],
  );

  const element = state ? (
    <Dialog
      title={state.title}
      onClose={() => {
        state.resolve(false);
        setState(null);
      }}
    >
      <div className="mw-stack">
        <div>{state.body}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            className="mw-btn mw-btn--ghost"
            onClick={() => {
              state.resolve(false);
              setState(null);
            }}
          >
            Cancel
          </button>
          <button
            className="mw-btn mw-btn--danger"
            onClick={() => {
              state.resolve(true);
              setState(null);
            }}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  ) : null;

  return { confirm, element };
}

/** Custom single-field text prompt (replaces window.prompt). */
export function usePrompt() {
  const [state, setState] = useState<{
    title: string;
    label: string;
    value: string;
    confirmLabel: string;
    resolve: (value: string | null) => void;
  } | null>(null);

  const prompt = useCallback(
    (opts: { title: string; label: string; initialValue?: string; confirmLabel?: string }) =>
      new Promise<string | null>((resolve) =>
        setState({
          title: opts.title,
          label: opts.label,
          value: opts.initialValue ?? "",
          confirmLabel: opts.confirmLabel ?? "Save",
          resolve,
        }),
      ),
    [],
  );

  function finish(value: string | null) {
    state?.resolve(value);
    setState(null);
  }

  const element = state ? (
    <Dialog title={state.title} onClose={() => finish(null)}>
      <form
        className="mw-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = state.value.trim();
          finish(trimmed || null);
        }}
      >
        <div className="mw-field">
          <label htmlFor="mw-prompt-input">{state.label}</label>
          <input
            id="mw-prompt-input"
            className="mw-input"
            autoFocus
            value={state.value}
            onChange={(e) => setState((s) => (s ? { ...s, value: e.target.value } : s))}
          />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="mw-btn mw-btn--ghost" onClick={() => finish(null)}>
            Cancel
          </button>
          <button type="submit" className="mw-btn mw-btn--primary" disabled={!state.value.trim()}>
            {state.confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  ) : null;

  return { prompt, element };
}
