import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  urlOrOptions: string | { method?: string; url?: string; body?: unknown },
  optionsOrData?: { method?: string; body?: unknown } | unknown,
): Promise<any> {
  let url: string;
  let method: string;
  let body: unknown;

  if (typeof urlOrOptions === 'string') {
    url = urlOrOptions;
    if (typeof optionsOrData === 'object' && optionsOrData !== null && 'method' in optionsOrData) {
      method = (optionsOrData as any).method || 'GET';
      body = (optionsOrData as any).body;
    } else {
      method = 'POST';
      body = optionsOrData;
    }
  } else {
    url = urlOrOptions.url || '';
    method = urlOrOptions.method || 'GET';
    body = urlOrOptions.body;
  }

  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
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
