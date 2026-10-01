import React, { createContext, useContext, useState, useEffect } from 'react';
import { safeParseResponse } from '../src/lib/apiClient';
import { authSessionSchema, authUserSchema, type AuthUser } from '../src/lib/auth/sessionContract';
import { authorizeOfflineReplaySession, clearActorScopedOfflineData, clearExpiredActorMarker, markActorAuthenticationExpired, processOfflineQueue, reconcileExpiredActorLogin, revokeOfflineReplaySession } from '../lib/syncService';

export type User = AuthUser;

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
});

const PRIVATE_LOCAL_STORAGE_KEYS = [
  'auth_session',
  'cached_campaigns',
  'cached_reservations',
  'hostPreviewListing',
] as const;

function clearPrivateBrowserState(actorId?: string | number | null): void {
  clearExpiredActorMarker();
  void clearActorScopedOfflineData(actorId).catch(error => {
    console.error('Failed to clear actor-scoped offline data:', error);
  });
  if (typeof localStorage === 'undefined') return;
  for (const key of PRIVATE_LOCAL_STORAGE_KEYS) localStorage.removeItem(key);
}

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    try {
      const storedUser = localStorage.getItem('user');
      if (!storedUser) return null;
      const parsed = authUserSchema.safeParse(JSON.parse(storedUser));
      if (!parsed.success) {
        localStorage.removeItem('user');
        return null;
      }
      // Older OTP responses exposed whole database rows. Drop any such fields
      // immediately; the saved identity remains untrusted until /me responds.
      const publicIdentity = JSON.stringify(parsed.data);
      if (publicIdentity !== storedUser) localStorage.setItem('user', publicIdentity);
      return parsed.data;
    } catch (e) {
      console.error("Failed to parse stored user from localStorage:", e);
      try { localStorage.removeItem('user'); } catch { /* Storage can be disabled; discard the in-memory identity regardless. */ }
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem('token');
    } catch {
      return null;
    }
  });
  const [sessionGeneration, setSessionGeneration] = useState(0);
  // A browser-stored identity is only a hint for cleanup and revalidation.
  // Never expose it to protected views before /api/auth/me confirms this token.
  const [verifiedSession, setVerifiedSession] = useState(false);

  useEffect(() => {
    const reconcileOtherTab = (event: StorageEvent) => {
      if (event.key !== 'user' && event.key !== 'token' && event.key !== null) return;
      // Stop rendering a stale actor immediately. Only accept the new actor after
      // the usual server identity check; never expose the previous private UI.
      revokeOfflineReplaySession();
      setVerifiedSession(false);
      setUser(null);
      setToken(localStorage.getItem('token'));
      setSessionGeneration(generation => generation + 1);
    };
    window.addEventListener('storage', reconcileOtherTab);
    return () => window.removeEventListener('storage', reconcileOtherTab);
  }, []);

  useEffect(() => {
    let active = true;
    const checkUser = async () => {
      if (token) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const parsed = await safeParseResponse<unknown>(res);
          if (!active || localStorage.getItem('token') !== token) return;
          const validated = parsed.ok ? authUserSchema.safeParse((parsed.data as { user?: unknown } | null)?.user) : null;
          if (validated?.success) {
            if (user && user.id !== validated.data.id) clearPrivateBrowserState(user.id);
            setUser(validated.data);
            localStorage.setItem('user', JSON.stringify(validated.data));
            setVerifiedSession(true);
            if (authorizeOfflineReplaySession(validated.data.id, token)) void processOfflineQueue();
          } else if (parsed.ok) {
            // A 200 response with an invalid identity is not proof of login.
            // Keep the candidate credential for later revalidation, but expose
            // no actor and do not dispatch queued protected work.
            setVerifiedSession(false);
            revokeOfflineReplaySession();
            console.warn('[/api/auth/me] Invalid identity response');
          } else if (parsed.status === 401 || parsed.status === 403) {
            // A rejected credential is not user-initiated logout. Retain the
            // unresolved, credential-free inquiry event for this same actor;
            // replay remains blocked until fresh authentication succeeds.
            if (user?.id != null) markActorAuthenticationExpired(user.id);
            else clearPrivateBrowserState(null);
            revokeOfflineReplaySession();
            setVerifiedSession(false);
            setToken(null);
            setUser(null);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            for (const key of PRIVATE_LOCAL_STORAGE_KEYS) localStorage.removeItem(key);
          } else if (!parsed.ok) {
            console.warn(`[/api/auth/me] Auth check returned non-OK status ${parsed.status}:`, parsed.error);
          }
        } catch (e) {
          console.error("Failed to fetch user:", e);
        }
      }
    };
    checkUser();
    return () => { active = false; };
  }, [token, sessionGeneration]);

  const login = (newUser: User, newToken: string) => {
    const session = authSessionSchema.safeParse({ user: newUser, token: newToken });
    if (!session.success) throw new Error('Authentication response was invalid. Please try again.');
    revokeOfflineReplaySession();
    reconcileExpiredActorLogin(session.data.user.id);
    if (user && user.id !== session.data.user.id) clearPrivateBrowserState(user.id);
    setUser(session.data.user);
    setToken(session.data.token);
    setVerifiedSession(true);
    localStorage.setItem('token', session.data.token);
    localStorage.setItem('user', JSON.stringify(session.data.user));
    if (authorizeOfflineReplaySession(session.data.user.id, session.data.token)) void processOfflineQueue();
  };

  const logout = () => {
    revokeOfflineReplaySession();
    clearPrivateBrowserState(user?.id);
    setVerifiedSession(false);
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth_session');
  };

  return (
    <AuthContext.Provider value={{ user: verifiedSession ? user : null, token: verifiedSession ? token : null, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
