import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

interface RouteGuardProps {
  children: React.ReactNode;
}

export default function RouteGuard({ children }: RouteGuardProps) {
  const { user, loading } = useAuth();
  const [location] = useLocation();
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  useEffect(() => {
    // Only check auth once loading is complete
    if (!loading) {
      setHasCheckedAuth(true);
    }
  }, [loading]);

  // Always render children immediately for public routes
  const publicRoutes = [
    '/',
    '/login',
    '/register',
    '/pricing',
    '/plans',
    '/checkout',
    '/forgot-password',
    '/reset-password',
    '/support',
    '/terms',
    '/privacy',
    '/test'
  ];

  const isPublicRoute = publicRoutes.includes(location);

  // For public routes, render immediately without auth check
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // For protected routes, wait for auth check
  if (!hasCheckedAuth) {
    return <>{children}</>;
  }

  return <>{children}</>;
}