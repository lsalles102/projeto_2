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
import { registerSchema } from "@shared/schema";
import { PasswordValidator, getPasswordStrength, isPasswordValid } from "@/components/PasswordValidator";
import { Crosshair, Eye, EyeOff } from "lucide-react";
import type { z } from "zod";

type RegisterFormData = z.infer<typeof registerSchema>;

export default function Register() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [password, setPassword] = useState("");

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterFormData) => apiRequest("/api/auth/register", { method: "POST", body: data }),
    onSuccess: () => {
      toast({
        title: "Cadastro realizado",
        description: "Bem-vindo ao FovDark! Você já está logado.",
      });
      navigate("/dashboard");
      window.location.reload(); // Refresh to update auth state
    },
    onError: (error: Error) => {
      toast({
        title: "Erro no cadastro",
        description: error.message || "Falha ao criar conta",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RegisterFormData) => {
    if (!acceptTerms) {
      toast({
        title: "Termos obrigatórios",
        description: "Você deve aceitar os termos de uso para continuar.",
        variant: "destructive",
      });
      return;
    }
    registerMutation.mutate(data);
  };



  return (
    <div className="min-h-screen flex items-center justify-center py-20">
      <div className="max-w-md w-full mx-auto px-6">
        <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <Crosshair className="text-primary text-4xl mx-auto mb-4" />
              <h2 className="text-3xl font-orbitron font-bold">CADASTRAR</h2>
              <p className="text-gray-400 mt-2">Crie sua conta FovDark</p>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-sm font-semibold">
                    Nome
                  </Label>
                  <Input
                    id="firstName"
                    placeholder="João"
                    className="bg-background/50 border-primary/20 focus:border-primary"
                    {...form.register("firstName")}
                  />
                  {form.formState.errors.firstName && (
                    <p className="text-sm text-red-500">{form.formState.errors.firstName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-sm font-semibold">
                    Sobrenome
                  </Label>
                  <Input
                    id="lastName"
                    placeholder="Silva"
                    className="bg-background/50 border-primary/20 focus:border-primary"
                    {...form.register("lastName")}
                  />
                  {form.formState.errors.lastName && (
                    <p className="text-sm text-red-500">{form.formState.errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="bg-background/50 border-primary/20 focus:border-primary"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold">
                  Senha
                  {password && (
                    <span className={`ml-2 text-xs ${getPasswordStrength(password).color}`}>
                      {getPasswordStrength(password).label}
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="bg-background/50 border-primary/20 focus:border-primary pr-10"
                    {...form.register("password", {
                      onChange: (e) => setPassword(e.target.value)
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                
                {password && (
                  <div className="mt-3">
                    <PasswordValidator password={password} showTitle={false} />
                  </div>
                )}
                
                {form.formState.errors.password && (
                  <p className="text-sm text-red-500 mt-2">{form.formState.errors.password.message}</p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="terms"
                  checked={acceptTerms}
                  onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
                />
                <Label htmlFor="terms" className="text-sm">
                  Concordo com os{" "}
                  <Link href="/terms" className="text-primary hover:underline">
                    Termos de Uso
                  </Link>{" "}
                  e{" "}
                  <Link href="/privacy" className="text-primary hover:underline">
                    Política de Privacidade
                  </Link>
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold hover:scale-105 transition-all duration-300"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  "CRIANDO CONTA..."
                ) : (
                  <>
                    <i className="fas fa-user-plus mr-2"></i>
                    CRIAR CONTA
                  </>
                )}
              </Button>
            </form>



            <p className="text-center text-sm text-gray-400 mt-6">
              Já tem uma conta?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Fazer login
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
