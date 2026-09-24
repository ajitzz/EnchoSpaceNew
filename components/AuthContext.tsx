import React, { createContext, useContext, useState, useEffect } from 'react';
import { safeParseResponse } from '../src/lib/apiClient';
import { clearActorScopedOfflineData } from '../lib/syncService';

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  phone?: string;
  can_host_experiences?: boolean;
}

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
      return storedUser ? JSON.parse(storedUser) : null;
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

  useEffect(() => {
    const checkUser = async () => {
      if (token) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const parsed = await safeParseResponse<{ user: User }>(res);
          if (parsed.ok && parsed.data?.user) {
            if (user && user.id !== parsed.data.user.id) clearPrivateBrowserState(user.id);
            setUser(parsed.data.user);
            localStorage.setItem('user', JSON.stringify(parsed.data.user));
          } else if (parsed.status === 401 || parsed.status === 403) {
            clearPrivateBrowserState(user?.id);
            setToken(null);
            setUser(null);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('auth_session');
          } else if (!parsed.ok) {
            console.warn(`[/api/auth/me] Auth check returned non-OK status ${parsed.status}:`, parsed.error);
          }
        } catch (e) {
          console.error("Failed to fetch user:", e);
        }
      }
    };
    checkUser();
  }, [token]);

  const login = (newUser: User, newToken: string) => {
    if (user && user.id !== newUser.id) clearPrivateBrowserState(user.id);
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = () => {
    clearPrivateBrowserState(user?.id);
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth_session');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
