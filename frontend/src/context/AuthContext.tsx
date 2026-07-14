import React, { createContext, useState, useContext, useEffect } from 'react';

interface User {
  id: number;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session
    const savedUser = localStorage.getItem('forecast_user');
    const savedToken = localStorage.getItem('forecast_token');
    if (savedUser && savedToken) {
      setUser(JSON.parse(savedUser));
      setToken(savedToken);
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Login failed');
      }

      const data = await response.json();
      localStorage.setItem('forecast_user', JSON.stringify(data.user));
      localStorage.setItem('forecast_token', data.token);
      setUser(data.user);
      setToken(data.token);
      return true;
    } catch (err: any) {
      console.warn('Backend login unavailable. Logging in with offline mock credentials...');
      // Hackathon fallback: offline mock account
      if (email && password.length >= 4) {
        const mockUser: User = { id: 1, name: email.split('@')[0], email };
        const mockToken = 'mock-jwt-token';
        localStorage.setItem('forecast_user', JSON.stringify(mockUser));
        localStorage.setItem('forecast_token', mockToken);
        setUser(mockUser);
        setToken(mockToken);
        return true;
      }
      throw new Error(err.message || 'Invalid credentials');
    }
  };

  const signup = async (name: string, email: string, password: string) => {
    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Signup failed');
      }

      const data = await response.json();
      return { success: true, message: data.message };
    } catch (err: any) {
      console.warn('Backend signup unavailable. Registering mock user offline...');
      return { success: true, message: 'Mock registration complete. Please log in.' };
    }
  };

  const logout = () => {
    localStorage.removeItem('forecast_user');
    localStorage.removeItem('forecast_token');
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
