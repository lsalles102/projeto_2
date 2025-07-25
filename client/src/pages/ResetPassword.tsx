import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, CheckCircle, AlertCircle } from "lucide-react";
import { resetPasswordSchema } from "@shared/schema";
import { PasswordValidator, getPasswordStrength, isPasswordValid } from "@/components/PasswordValidator";
import { authApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { z } from "zod";

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const [location] = useLocation();
  const [token, setToken] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    let tokenParam = null;
    
    // Método 1: Usar URL API
    try {
      const url = new URL(window.location.href);
      tokenParam = url.searchParams.get('token');
    } catch (e) {
      console.warn('URL API failed, trying alternative method');
    }
    
    // Método 2: Extração manual da query string (fallback)
    if (!tokenParam) {
      const queryString = window.location.search;
      const urlParams = new URLSearchParams(queryString);
      tokenParam = urlParams.get('token');
    }
    
    // Método 3: Regex fallback para casos extremos
    if (!tokenParam) {
      const match = window.location.href.match(/[?&]token=([^&]+)/);
      if (match) {
        tokenParam = match[1];
      }
    }
    
    console.log('URL:', window.location.href);
    console.log('Token extraído:', tokenParam);
    
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      console.error('Nenhum token encontrado na URL');
    }
  }, [location]);

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (token) {
      form.setValue('token', token);
    }
  }, [token, form]);

  const resetPasswordMutation = useMutation({
    mutationFn: (data: ResetPasswordFormData) => 
      authApi.resetPassword(data.token, data.password, data.confirmPassword),
    onSuccess: () => {
      setIsSuccess(true);
      toast({
        title: "Senha redefinida",
        description: "Sua senha foi alterada com sucesso. Você pode fazer login agora.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao redefinir senha",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ResetPasswordFormData) => {
    resetPasswordMutation.mutate(data);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
              <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-2xl font-bold">Token Inválido</CardTitle>
            <CardDescription>
              O link de redefinição de senha é inválido ou expirou.
            </CardDescription>
            <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded text-xs">
              <strong>Debug Info:</strong><br/>
              URL: {window.location.href}<br/>
              Search: {window.location.search}<br/>
              Hash: {window.location.hash}<br/>
              Token: {token || 'null'}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Por favor, solicite um novo link de redefinição de senha.
                </AlertDescription>
              </Alert>
              <Button asChild className="w-full">
                <Link href="/forgot-password">
                  Solicitar Novo Link
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl font-bold">Senha Redefinida</CardTitle>
            <CardDescription>
              Sua senha foi alterada com sucesso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Agora você pode fazer login com sua nova senha.
                </AlertDescription>
              </Alert>
              <Button asChild className="w-full">
                <Link href="/login">
                  Fazer Login
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Redefinir Senha</CardTitle>
          <CardDescription className="text-center">
            Digite sua nova senha abaixo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">
                Nova Senha
                {password && (
                  <span className={`ml-2 text-xs ${getPasswordStrength(password).color}`}>
                    {getPasswordStrength(password).label}
                  </span>
                )}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Digite sua nova senha"
                {...form.register("password", {
                  onChange: (e) => setPassword(e.target.value)
                })}
                className={form.formState.errors.password ? "border-red-500" : ""}
              />
              
              {password && (
                <div className="mt-3">
                  <PasswordValidator password={password} showTitle={false} />
                </div>
              )}
              
              {form.formState.errors.password && (
                <p className="text-sm text-red-500 mt-2">{form.formState.errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirme sua nova senha"
                {...form.register("confirmPassword")}
                className={form.formState.errors.confirmPassword ? "border-red-500" : ""}
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-red-500">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redefinindo...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Redefinir Senha
                </>
              )}
            </Button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400">
                ← Voltar ao login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}