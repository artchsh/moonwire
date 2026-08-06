import { useCallback, useEffect, useState } from "react";
import type { SessionInfo } from "../shared/api";
import { api } from "./api/client";
import { SetupScreen } from "./features/auth/SetupScreen";
import { LoginScreen } from "./features/auth/LoginScreen";
import { Shell } from "./layout/Shell";
import { Skeleton } from "./components/ui";

export function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSession(await api.session());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="mw-auth">
        <div className="mw-auth__card mw-stack" aria-busy="true">
          <Skeleton height={24} width={140} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </div>
      </div>
    );
  }

  if (session?.setupRequired) {
    return <SetupScreen onDone={(s) => setSession(s)} />;
  }
  if (!session?.authenticated) {
    return <LoginScreen onDone={(s) => setSession(s)} />;
  }

  return (
    <Shell
      username={session.username ?? "admin"}
      onLogout={async () => {
        await api.logout();
        await refresh();
      }}
    />
  );
}
