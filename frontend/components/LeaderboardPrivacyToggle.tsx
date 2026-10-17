/**
 * components/LeaderboardPrivacyToggle.tsx
 * Lets a signed-in user hide their account from the public tip leaderboards.
 * Backed by GET/PUT /api/tips/leaderboard/opt-out (JWT required).
 */

import { useEffect, useState } from "react";
import { getJwtToken } from "@/lib/auth";

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";
}

export default function LeaderboardPrivacyToggle() {
  const [optedOut, setOptedOut] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const jwt = getJwtToken();
    setToken(jwt);
    if (!jwt) return;
    fetch(`${apiBase()}/api/tips/leaderboard/opt-out`, {
      headers: { Authorization: `Bearer ${jwt}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body) => setOptedOut(Boolean(body?.data?.optedOut)))
      .catch(() => setError("Could not load your leaderboard preference."));
  }, []);

  const toggle = async (next: boolean) => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase()}/api/tips/leaderboard/opt-out`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ optedOut: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setOptedOut(Boolean(body?.data?.optedOut));
    } catch {
      setError("Could not save your leaderboard preference. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-cosmos-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Leaderboard privacy</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Hide your account from the public tip leaderboards and top tipper lists. Your tips still
        count toward creator totals.
      </p>
      {!token ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sign in with your wallet to change this setting.
        </p>
      ) : (
        <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            aria-label="Hide me from leaderboards"
            checked={optedOut === true}
            disabled={optedOut === null || saving}
            onChange={(e) => toggle(e.target.checked)}
          />
          Hide me from leaderboards
        </label>
      )}
      {error && <p role="alert" className="text-sm text-red-500 mt-2">{error}</p>}
    </div>
  );
}
