import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Crosshair, LogOut, User } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Header() {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      toast({
        title: "Logout realizado",
        description: "Você foi desconectado com sucesso.",
      });
      navigate("/");
      window.location.reload(); // Refresh to clear auth state
    },
    onError: () => {
      toast({
        title: "Erro no logout",
        description: "Ocorreu um erro ao fazer logout.",
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/pricing", label: "Preços" },
    { href: "/support", label: "Suporte" },
  ];

  return (
    <header className="fixed top-0 w-full z-50 glass-effect">
      <nav className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
            <Crosshair className="text-neon-green text-2xl" />
            <h1 className="text-2xl font-orbitron font-bold text-glow">FovDark</h1>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`transition-colors duration-300 hover:text-neon-green ${
                  location === item.href ? "text-neon-green" : "text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button className="bg-neon-green text-black hover:bg-neon-green/90 neon-glow">
                    <User className="w-4 h-4 mr-2" />
                    Painel
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  className="glass-effect hover:bg-glass-border"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </Button>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" className="glass-effect hover:bg-glass-border">
                    Login
                  </Button>
                </Link>
                <Link href="/register">
                  <Button className="bg-neon-green text-black hover:bg-neon-green/90 neon-glow">
                    Cadastrar
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu */}
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-dark-surface border-glass-border">
              <div className="flex flex-col space-y-4 mt-8">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-lg transition-colors duration-300 hover:text-neon-green ${
                      location === item.href ? "text-neon-green" : "text-white"
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
                
                <div className="border-t border-glass-border pt-4 space-y-4">
                  {isAuthenticated ? (
                    <>
                      <Link href="/dashboard" onClick={() => setIsMenuOpen(false)}>
                        <Button className="w-full bg-neon-green text-black hover:bg-neon-green/90">
                          <User className="w-4 h-4 mr-2" />
                          Painel
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          handleLogout();
                          setIsMenuOpen(false);
                        }}
                        disabled={logoutMutation.isPending}
                        className="w-full glass-effect"
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sair
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link href="/login" onClick={() => setIsMenuOpen(false)}>
                        <Button variant="ghost" className="w-full glass-effect">
                          Login
                        </Button>
                      </Link>
                      <Link href="/register" onClick={() => setIsMenuOpen(false)}>
                        <Button className="w-full bg-neon-green text-black hover:bg-neon-green/90">
                          Cadastrar
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
