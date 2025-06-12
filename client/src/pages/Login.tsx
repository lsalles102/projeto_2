import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { loginSchema } from "@shared/schema";
import { Crosshair, Eye, EyeOff } from "lucide-react";
import type { z } from "zod";

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginFormData) => apiRequest("POST", "/api/auth/login", data),
    onSuccess: () => {
      toast({
        title: "Login realizado",
        description: "Bem-vindo de volta ao FovDark!",
      });
      navigate("/dashboard");
      window.location.reload(); // Refresh to update auth state
    },
    onError: (error: Error) => {
      toast({
        title: "Erro no login",
        description: error.message || "Credenciais inválidas",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-20">
      <div className="max-w-md w-full mx-auto px-6">
        <Card className="glass-effect border-glass-border">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <Crosshair className="text-neon-green text-4xl mx-auto mb-4" />
              <h2 className="text-3xl font-orbitron font-bold text-glow">ENTRAR</h2>
              <p className="text-gray-400 mt-2">Acesse sua conta FovDark</p>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="bg-dark-surface border-glass-border focus:border-neon-green"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold">
                  Senha
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="bg-dark-surface border-glass-border focus:border-neon-green pr-10"
                    {...form.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <p className="text-sm text-red-500">{form.formState.errors.password.message}</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox id="remember" />
                  <Label htmlFor="remember" className="text-sm">
                    Lembrar-me
                  </Label>
                </div>
                <Link href="/forgot-password" className="text-neon-green text-sm hover:underline">
                  Esqueci minha senha
                </Link>
              </div>

              <Button
                type="submit"
                className="w-full py-3 bg-neon-green text-black rounded-lg neon-glow font-bold hover:scale-105 transition-all duration-300"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  "ENTRANDO..."
                ) : (
                  <>
                    <i className="fas fa-sign-in-alt mr-2"></i>
                    ENTRAR
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full border-glass-border" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-dark-bg text-gray-400">OU</span>
                </div>
              </div>

              <Button
                onClick={handleGoogleLogin}
                variant="ghost"
                className="w-full mt-4 py-3 glass-effect rounded-lg font-semibold hover:bg-glass-border transition-all duration-300"
              >
                <i className="fab fa-google mr-2 text-red-500"></i>
                Continuar com Google
              </Button>
            </div>

            <p className="text-center text-sm text-gray-400 mt-6">
              Não tem uma conta?{" "}
              <Link href="/register" className="text-neon-green hover:underline">
                Cadastre-se
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
