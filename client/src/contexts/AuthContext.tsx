import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<any>;
  resetPassword: (email: string) => Promise<any>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isLoading: true,
  isAuthenticated: false,
  signUp: async () => {},
  signIn: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/user', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          // The server returns { user: userData }, so we need to extract the user
          setUser(data.user || data);
        } else {
          // Clear any stored user data on failed auth
          setUser(null);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    const data = await apiRequest('POST', '/api/auth/register', {
      email,
      password,
      firstName,
      lastName,
    });
    
    if (data.user) {
      setUser(data.user);
    }
    
    return data;
  };

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      console.log('AuthContext: Tentando fazer login com:', { email });
      
      const data = await apiRequest('POST', '/api/auth/login', {
        email,
        password,
      });
      
      console.log('AuthContext: Resposta do login:', data);
      
      if (data && data.user) {
        console.log('AuthContext: Usuário logado com sucesso:', data.user.email);
        setUser(data.user);
        return data;
      } else {
        console.error('AuthContext: Resposta do login não contém usuário válido');
        throw new Error('Resposta de login inválida');
      }
    } catch (error: any) {
      console.error('AuthContext: Erro no login:', error);
      setUser(null);
      // Parse error message properly
      const errorMessage = error?.message || 'Erro no login';
      if (errorMessage.includes('Credenciais inválidas')) {
        throw new Error('Email ou senha incorretos');
      }
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await apiRequest('POST', '/api/auth/logout', {});
    setUser(null);
  };

  const resetPassword = async (email: string) => {
    return await apiRequest('POST', '/api/auth/forgot-password', { email });
  };

  const value = {
    user,
    loading,
    isLoading: loading,
    isAuthenticated: !!user,
    signUp,
    signIn,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};