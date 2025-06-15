import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PasswordValidator, getPasswordStrength, isPasswordValid } from "@/components/PasswordValidator";
import { Link } from "wouter";
import { 
  ArrowLeft,
  Settings as SettingsIcon,
  Shield,
  Key,
  Trash2
} from "lucide-react";
import { z } from "zod";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual é obrigatória"),
  newPassword: z.string()
    .min(8, "Nova senha deve ter pelo menos 8 caracteres")
    .max(128, "Nova senha muito longa")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, 
      "Nova senha deve conter pelo menos: 1 letra minúscula, 1 maiúscula, 1 número e 1 caractere especial (@$!%*?&)"),
  confirmPassword: z.string().min(8, "Confirmação é obrigatória"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type ChangePasswordData = z.infer<typeof changePasswordSchema>;

export default function Settings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("security");
  const [newPassword, setNewPassword] = useState("");

  // Fetch user data
  const { data: userData, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  const user = userData as any;

  // Password form
  const passwordForm = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });



  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: (data: ChangePasswordData) => apiRequest("/api/users/change-password", data),
    onSuccess: () => {
      toast({
        title: "Senha alterada",
        description: "Sua senha foi alterada com sucesso!",
      });
      passwordForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao alterar senha",
        description: error.message || "Falha ao alterar senha",
        variant: "destructive",
      });
    },
  });



  const onChangePassword = (data: ChangePasswordData) => {
    changePasswordMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-20 max-w-4xl">
        <div className="animate-pulse space-y-8">
          <div className="h-8 bg-muted rounded"></div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-20 max-w-4xl">
      {/* Header */}
      <div className="flex items-center mb-8">
        <Link href="/dashboard">
          <Button variant="ghost" className="mr-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao Dashboard
          </Button>
        </Link>
        <h1 className="text-3xl font-orbitron font-bold">
          <SettingsIcon className="w-8 h-8 inline mr-3 text-primary" />
          Configurações
        </h1>
      </div>

      <div className="grid lg:grid-cols-4 gap-8">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardContent className="p-4">
              <nav className="space-y-2">
                <button
                  onClick={() => setActiveTab("security")}
                  className="w-full text-left px-4 py-2 rounded-lg bg-primary/20 text-primary"
                >
                  <Shield className="w-4 h-4 inline mr-2" />
                  Segurança
                </button>
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {/* Security Tab */}
          {activeTab === "security" && (
            <div className="space-y-6">
              <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Key className="w-5 h-5 mr-2 text-primary" />
                    Alterar Senha
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-4">
                    <div>
                      <Label htmlFor="currentPassword">Senha Atual</Label>
                      <Input
                        id="currentPassword"
                        type="password"
                        {...passwordForm.register("currentPassword")}
                        className="bg-background/50 border-primary/20 focus:border-primary"
                      />
                      {passwordForm.formState.errors.currentPassword && (
                        <p className="text-sm text-red-500 mt-1">
                          {passwordForm.formState.errors.currentPassword.message}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="newPassword">Nova Senha</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        {...passwordForm.register("newPassword")}
                        className="bg-background/50 border-primary/20 focus:border-primary"
                      />
                      <div className="text-xs text-gray-400 mt-1">
                        A senha deve conter pelo menos:
                        <ul className="list-disc list-inside mt-1 space-y-0.5">
                          <li>8 caracteres</li>
                          <li>1 letra minúscula (a-z)</li>
                          <li>1 letra maiúscula (A-Z)</li>
                          <li>1 número (0-9)</li>
                          <li>1 caractere especial (@$!%*?&)</li>
                        </ul>
                      </div>
                      {passwordForm.formState.errors.newPassword && (
                        <p className="text-sm text-red-500 mt-1">
                          {passwordForm.formState.errors.newPassword.message}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        {...passwordForm.register("confirmPassword")}
                        className="bg-background/50 border-primary/20 focus:border-primary"
                      />
                      {passwordForm.formState.errors.confirmPassword && (
                        <p className="text-sm text-red-500 mt-1">
                          {passwordForm.formState.errors.confirmPassword.message}
                        </p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      disabled={changePasswordMutation.isPending}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Key className="w-4 h-4 mr-2" />
                      {changePasswordMutation.isPending ? "Alterando..." : "Alterar Senha"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center text-red-400">
                    <Trash2 className="w-5 h-5 mr-2" />
                    Zona de Perigo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-400 mb-4">
                    Uma vez que você excluir sua conta, não há como voltar atrás. Por favor, tenha certeza.
                  </p>
                  <Button variant="destructive" disabled>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir Conta (Em breve)
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}


        </div>
      </div>
    </div>
  );
}