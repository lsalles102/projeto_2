import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown
): Promise<any> {
  try {
    console.log(`[API] Fazendo requisição ${method} para ${url}`, data ? { method, body: data } : { method });
    
    // Import getAuthToken dynamically to avoid circular dependencies
    const { getAuthToken } = await import('./api');
    const token = getAuthToken();
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      console.log(`[API] Token incluído na requisição ${method} ${url}`);
    } else {
      console.warn(`[API] Sem token para requisição ${method} ${url}`);
    }
    
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    console.log(`[API] Status da resposta: ${res.status}`);
    
    if (!res.ok) {
      let errorText = "";
      try {
        const errorData = await res.json();
        errorText = errorData.message || JSON.stringify(errorData);
      } catch {
        errorText = await res.text() || res.statusText;
      }
      console.error(`[API] Erro ${res.status}:`, errorText);
      throw new Error(errorText);
    }
    
    const responseData = await res.json();
    console.log(`[API] Resposta recebida:`, responseData);
    return responseData;
  } catch (error: any) {
    console.error(`[API] Erro na requisição ${method} ${url}:`, error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Import getAuthToken dynamically to avoid circular dependencies
    const { getAuthToken } = await import('./api');
    const token = getAuthToken();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      console.log(`QueryFn: Enviando token para ${queryKey[0]}`);
    } else {
      console.warn(`QueryFn: Sem token para ${queryKey[0]}`);
    }
    
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
