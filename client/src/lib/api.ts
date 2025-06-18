// API utilities for client-server communication
import { queryClient } from './queryClient';

const API_BASE = '';

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
  
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'include', // Always include cookies for session auth
  };

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
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