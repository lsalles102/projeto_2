import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { loginSchema } from "@shared/schema";
import { Crosshair, Eye, EyeOff } from "lucide-react";
import type { z } from "zod";

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { signIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
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
