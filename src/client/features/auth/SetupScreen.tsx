import { useState } from "react";
import type { SessionInfo } from "../../../shared/api";
import { api, ApiClientError } from "../../api/client";
import { Logo } from "../../components/Logo";

export function SetupScreen({ onDone }: { onDone: (s: SessionInfo) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      onDone(await api.setup(username, password));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mw-auth">
      <form className="mw-auth__card mw-stack" onSubmit={submit}>
        <Logo size={30} />
        <div>
          <h1 className="mw-auth__title">Set up your board</h1>
          <p className="mw-auth__sub">
            Create the administrator account. This runs once, so keep the credentials safe.
          </p>
        </div>

        <div className="mw-field">
          <label htmlFor="su-user">Username</label>
          <input
            id="su-user"
            className="mw-input"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
          />
        </div>
        <div className="mw-field">
          <label htmlFor="su-pass">Password</label>
          <input
            id="su-pass"
            className="mw-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="mw-field">
          <label htmlFor="su-confirm">Confirm password</label>
          <input
            id="su-confirm"
            className="mw-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="mw-field__error" role="alert">
            {error}
          </p>
        )}
        <button className="mw-btn mw-btn--primary" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
