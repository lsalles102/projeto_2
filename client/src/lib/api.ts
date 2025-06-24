// API utilities for client-server communication
import { queryClient } from './queryClient';

const API_BASE = '';

// Token storage with improved reliability
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  console.log('API: Definindo token:', token ? 'Presente' : 'Null');
  authToken = token;
  if (token) {
    try {
      localStorage.setItem('authToken', token);
      console.log('API: Token salvo no localStorage');
    } catch (error) {
      console.error('API: Erro ao salvar token:', error);
    }
  } else {
    try {
      localStorage.removeItem('authToken');
      authToken = null;
      console.log('API: Token removido do localStorage');
    } catch (error) {
      console.error('API: Erro ao remover token:', error);
    }
  }
}

export function getAuthToken(): string | null {
  // Always check localStorage first to ensure consistency
  try {
    const storedToken = localStorage.getItem('authToken');
    if (storedToken && storedToken !== authToken) {
      authToken = storedToken;
      console.log('API: Token sincronizado do localStorage:', authToken ? 'Presente' : 'Null');
    } else if (!storedToken) {
      authToken = null;
    }
  } catch (error) {
    console.error('API: Erro ao recuperar token:', error);
    authToken = null;
  }
  return authToken;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchApi<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  // Always get fresh token for each request
  const token = getAuthToken();
  console.log(`API: Fazendo requisição para ${endpoint} com token:`, token ? `${token.substring(0, 20)}...` : 'Ausente');
  
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
    console.log(`API: Header Authorization adicionado para ${endpoint}`);
  } else {
    console.warn(`API: Nenhum token disponível para ${endpoint} - usuário precisa fazer login`);
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'include', // Always include cookies for session auth
  };

  console.log(`API: Headers finais para ${endpoint}:`, Object.keys(config.headers || {}));

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }
      
      // Handle 401 errors by clearing invalid tokens
      if (response.status === 401) {
        console.warn('API: Token inválido ou expirado, limpando...');
        setAuthToken(null);
      }
      
      throw new ApiError(
        errorData.message || `HTTP ${response.status}`,
        response.status,
        errorData
      );
    }

    // Handle empty responses
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json();
    }
    
    return response.text() as any;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      0,
      error
    );
  }
}

// Auth API calls
export const authApi = {
  async login(email: string, password: string) {
    return fetchApi('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    return fetchApi('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async logout() {
    return fetchApi('/api/auth/logout', {
      method: 'POST',
    });
  },

  async getUser() {
    return fetchApi('/api/auth/user');
  },

  async forgotPassword(email: string) {
    return fetchApi('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, password: string, confirmPassword: string) {
    return fetchApi('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password, confirmPassword }),
    });
  },

  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string) {
    return fetchApi('/api/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
  },
};

// License API calls
export const licenseApi = {
  async getStatus() {
    return fetchApi('/api/license/status');
  },

  async heartbeat(hwid: string) {
    return fetchApi('/api/license/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ hwid }),
    });
  },

  async resetHwid(reason: string) {
    return fetchApi('/api/license/reset-hwid', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};

// Dashboard API calls
export const dashboardApi = {
  async getData() {
    return fetchApi('/api/dashboard');
  },
};

// Payment API calls
export const paymentApi = {
  async createPixPayment(data: {
    plan: string;
    durationDays: number;
    payerEmail: string;
    payerFirstName: string;
    payerLastName: string;
  }) {
    return fetchApi('/api/payments/create-pix', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getPaymentStatus(paymentId: string) {
    return fetchApi(`/api/payments/status/${paymentId}`);
  },
};

// User API calls
export const userApi = {
  async updateProfile(data: { username?: string; email?: string }) {
    return fetchApi('/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async getDownloads() {
    return fetchApi('/api/user/downloads');
  },
};

// Admin API calls
export const adminApi = {
  async getUsers() {
    return fetchApi('/api/admin/users');
  },

  async getStats() {
    return fetchApi('/api/admin/stats');
  },

  async updateUser(userId: string, data: any) {
    return fetchApi(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteUser(userId: string) {
    return fetchApi(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });
  },

  async resetUserHwid(userId: string, reason: string) {
    return fetchApi('/api/admin/reset-hwid', {
      method: 'POST',
      body: JSON.stringify({ userId, reason }),
    });
  },
};

// Health check
export const healthApi = {
  async check() {
    return fetchApi('/api/health');
  },
};