import { useEffect, useState } from "react";
import { Copy, Download } from "lucide-react";
import type {
  AgentTokenDto,
  CreatedAgentTokenDto,
  Scope,
  StorageInfo,
  UserDto,
} from "../../shared/api";
import { api, ApiClientError } from "../api/client";
import { Dialog, useToast, useConfirm } from "../components/ui";
import { Select } from "../components/Select";

export function SettingsDialog({
  currentUsername,
  onClose,
}: {
  currentUsername: string;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<UserDto[] | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [userBusy, setUserBusy] = useState(false);
  const [tokens, setTokens] = useState<AgentTokenDto[] | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>("write");
  const [created, setCreated] = useState<CreatedAgentTokenDto | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { confirm, element: confirmEl } = useConfirm();

  async function reload() {
    const [{ users }, { tokens }, storage] = await Promise.all([
      api.listUsers(),
      api.listTokens(),
      api.storage(),
    ]);
    setUsers(users);
    setTokens(tokens);
    setStorage(storage);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) return;
    setUserBusy(true);
    try {
      await api.createUser(newUsername.trim(), newPassword);
      setNewUsername("");
      setNewPassword("");
      await reload();
      toast.push("User created");
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : "Could not create user";
      toast.push(message);
    } finally {
      setUserBusy(false);
    }
  }

  async function removeUser(user: UserDto) {
    const ok = await confirm({
      title: "Remove user?",
      body: (
        <>
          Remove <strong>{user.username}</strong>? They will be signed out immediately and lose
          access.
        </>
      ),
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await api.deleteUser(user.id);
      await reload();
      toast.push("User removed");
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Could not remove user";
      toast.push(message);
    }
  }

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const token = await api.createToken(name.trim(), scope);
      setCreated(token);
      setName("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: AgentTokenDto) {
    const ok = await confirm({
      title: "Revoke token?",
      body: (
        <>
          Revoke <strong>{token.name}</strong>? Any agent using it will immediately lose access.
        </>
      ),
      confirmLabel: "Revoke",
    });
    if (!ok) return;
    await api.deleteToken(token.id);
    await reload();
    toast.push("Token revoked");
  }

  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="mw-stack">
        <section>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Users</h3>
          <p style={{ color: "var(--mw-text-muted)", fontSize: 13, marginTop: 0 }}>
            Give a colleague access by creating an account. Every user has full access. Share the
            initial password with them directly.
          </p>

          <form
            onSubmit={createUser}
            style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
          >
            <div className="mw-field" style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="user-name">Username</label>
              <input
                id="user-name"
                className="mw-input"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. alex"
                autoComplete="off"
              />
            </div>
            <div className="mw-field" style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="user-password">Initial password</label>
              <input
                id="user-password"
                className="mw-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <button
              className="mw-btn mw-btn--primary"
              disabled={userBusy || !newUsername.trim() || newPassword.length < 8}
            >
              Create
            </button>
          </form>

          <div style={{ marginTop: 12 }}>
            {users === null ? (
              <p style={{ color: "var(--mw-text-faint)" }}>Loading…</p>
            ) : (
              users.map((u) => {
                const isSelf = u.username === currentUsername;
                return (
                  <div className="mw-token-row" key={u.id}>
                    <div className="mw-token-row__meta">
                      <div className="mw-token-row__name">
                        {u.username}
                        {isSelf && <span style={{ color: "var(--mw-text-faint)" }}> (you)</span>}
                      </div>
                      <div className="mw-token-row__sub">
                        Added {new Date(u.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      className="mw-btn mw-btn--ghost mw-btn--sm"
                      disabled={isSelf}
                      title={isSelf ? "You cannot remove your own account" : undefined}
                      onClick={() => void removeUser(u)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Agent tokens</h3>
          <p style={{ color: "var(--mw-text-muted)", fontSize: 13, marginTop: 0 }}>
            Bearer tokens let AI agents read or edit your boards through the API.
          </p>

          {created && (
            <div className="mw-stack" style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 13, margin: 0 }}>
                Copy this token now. It is shown <strong>only once</strong>.
              </p>
              <code className="mw-code">{created.token}</code>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="mw-btn mw-btn--sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(created.token);
                    toast.push("Token copied");
                  }}
                >
                  <Copy size={15} strokeWidth={1.75} /> Copy
                </button>
                <button className="mw-btn mw-btn--ghost mw-btn--sm" onClick={() => setCreated(null)}>
                  Done
                </button>
              </div>
            </div>
          )}

          <form onSubmit={createToken} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div className="mw-field" style={{ flex: 1 }}>
              <label htmlFor="tok-name">Token name</label>
              <input
                id="tok-name"
                className="mw-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Planning agent"
              />
            </div>
            <div className="mw-field">
              <label htmlFor="tok-scope">Scope</label>
              <Select
                id="tok-scope"
                ariaLabel="Token scope"
                value={scope}
                onChange={(v) => setScope(v as Scope)}
                options={[
                  { value: "write", label: "Read & write" },
                  { value: "read", label: "Read only" },
                ]}
              />
            </div>
            <button className="mw-btn mw-btn--primary" disabled={busy || !name.trim()}>
              Create
            </button>
          </form>

          <div style={{ marginTop: 12 }}>
            {tokens === null ? (
              <p style={{ color: "var(--mw-text-faint)" }}>Loading…</p>
            ) : tokens.length === 0 ? (
              <p style={{ color: "var(--mw-text-faint)" }}>No tokens yet.</p>
            ) : (
              tokens.map((t) => (
                <div className="mw-token-row" key={t.id}>
                  <div className="mw-token-row__meta">
                    <div className="mw-token-row__name">{t.name}</div>
                    <div className="mw-token-row__sub">
                      {t.lastUsedAt ? `Last used ${new Date(t.lastUsedAt).toLocaleString()}` : "Never used"}
                    </div>
                  </div>
                  <span className={`mw-badge mw-badge--${t.scope}`}>{t.scope}</span>
                  <button className="mw-btn mw-btn--ghost mw-btn--sm" onClick={() => void revoke(t)}>
                    Revoke
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Storage</h3>
          {storage ? (
            <p style={{ color: "var(--mw-text-muted)", fontSize: 13, margin: 0 }}>
              {storage.boards} boards · {storage.columns} columns · {storage.cards} cards ·{" "}
              {storage.attachments} images ({formatBytes(storage.attachmentBytes)})
            </p>
          ) : (
            <p style={{ color: "var(--mw-text-faint)" }}>Loading…</p>
          )}
          <button
            className="mw-btn mw-btn--ghost mw-btn--sm"
            style={{ marginTop: 8 }}
            onClick={async () => {
              const data = await api.exportData();
              downloadJson(data, "moonwire-export.json");
            }}
          >
            <Download size={15} strokeWidth={1.75} /> Export all data (JSON)
          </button>
        </section>
      </div>
      {confirmEl}
    </Dialog>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
