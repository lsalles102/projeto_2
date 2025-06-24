import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, setAuthToken, getAuthToken } from '@/lib/api';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_admin?: boolean;
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
        // First, check if we have a stored token
        const token = getAuthToken();
        console.log('AuthContext: Verificando token inicial:', token ? 'Presente' : 'Null');
        
        if (token) {
          console.log('AuthContext: Token encontrado, verificando validade...');
          // Verify token is valid by making API call - but don't block page rendering
          try {
            const data = await authApi.getUser();
            console.log('AuthContext: Usuário verificado com token:', data.user?.email || data.email);
            setUser(data.user || data);
          } catch (apiError: any) {
            console.log('AuthContext: Token inválido ou expirado, removendo');
            console.error('AuthContext: Erro na verificação:', apiError.message);
            setAuthToken(null);
            setUser(null);
          }
        } else {
          console.log('AuthContext: Nenhum token encontrado');
          setUser(null);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        setUser(null);
        setAuthToken(null);
      } finally {
        setLoading(false);
      }
    };

    // Add a small delay to prevent blocking page render
    const timer = setTimeout(checkAuth, 100);
    return () => clearTimeout(timer);
  }, []);

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    const data = await authApi.register({
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
      
      const data = await authApi.login(email, password);
      
      console.log('AuthContext: Resposta do login:', data);
      
      if (data && data.user) {
        console.log('AuthContext: Usuário logado com sucesso:', data.user.email);
        
        // Store token FIRST before setting user
        if (data.token) {
          console.log('AuthContext: Salvando token JWT');
          setAuthToken(data.token);
          
          // Force immediate verification
          const verifyToken = getAuthToken();
          console.log('AuthContext: Token imediatamente verificado:', verifyToken ? 'OK' : 'ERRO');
          
          if (!verifyToken) {
            throw new Error('Falha ao salvar token de autenticação');
          }
        } else {
          throw new Error('Token não recebido do servidor');
        }
        
        // Then set user - this will trigger re-renders
        setUser(data.user);
        
        return data;
      } else if (data) {
        console.log('AuthContext: Dados recebidos mas sem user:', data);
        throw new Error('Dados de login inválidos');
      }
    } catch (error) {
      console.error('AuthContext: Erro no login:', error);
      setUser(null);
      setAuthToken(null);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Erro no logout:', error);
    } finally {
      setUser(null);
      setAuthToken(null);
    }
  };

  const resetPassword = async (email: string) => {
    return await authApi.forgotPassword(email);
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