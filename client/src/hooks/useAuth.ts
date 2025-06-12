import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return {
    user: data?.user,
    license: data?.license,
    isLoading,
    isAuthenticated: !!data?.user,
  };
}
