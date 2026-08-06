import { useState } from "react";
import type { SessionInfo } from "../../../shared/api";
import { api, ApiClientError } from "../../api/client";
import { Logo } from "../../components/Logo";

export function LoginScreen({ onDone }: { onDone: (s: SessionInfo) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onDone(await api.login(username, password));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mw-auth">
      <form className="mw-auth__card mw-stack" onSubmit={submit}>
        <Logo size={30} />
        <div>
          <h1 className="mw-auth__title">Welcome back</h1>
          <p className="mw-auth__sub">Sign in to your Moonwire boards.</p>
        </div>

        <div className="mw-field">
          <label htmlFor="li-user">Username</label>
          <input
            id="li-user"
            className="mw-input"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="mw-field">
          <label htmlFor="li-pass">Password</label>
          <input
            id="li-pass"
            className="mw-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="mw-field__error" role="alert">
            {error}
          </p>
        )}
        <button className="mw-btn mw-btn--primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
