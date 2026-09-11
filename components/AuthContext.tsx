import React, { createContext, useContext, useState, useEffect } from 'react';
import { safeParseResponse } from '../src/lib/apiClient';

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

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    try {
      const storedUser = localStorage.getItem('user');
      return storedUser ? JSON.parse(storedUser) : null;
    } catch (e) {
      console.error("Failed to parse stored user from localStorage:", e);
      try { localStorage.removeItem('user'); } catch {}
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
            setUser(parsed.data.user);
            localStorage.setItem('user', JSON.stringify(parsed.data.user));
          } else if (parsed.status === 401 || parsed.status === 403) {
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
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
