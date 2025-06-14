import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getHWID } from "@/lib/authUtils";
import { activateKeySchema } from "@shared/schema";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { Link } from "wouter";
import { 
  Key, 
  Download, 
  Shield, 
  Clock, 
  User, 
  Monitor, 
  RefreshCw, 
  Settings, 
  Headphones,
  Archive,
  FileText,
  Activity,
  Eye,
  ExternalLink
} from "lucide-react";
import type { z } from "zod";

type ActivateKeyFormData = z.infer<typeof activateKeySchema>;

export default function Dashboard() {
  const { toast } = useToast();
  const [showActivateForm, setShowActivateForm] = useState(false);

  // Fetch dashboard data with optimized caching
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/dashboard"],
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: (failureCount, error: any) => {
      if (error?.status === 401) return false;
      return failureCount < 2;
    }
  });

  const user = (data as any)?.user;
  const license = (data as any)?.license;
  const downloads = (data as any)?.downloads || [];
  const stats = (data as any)?.stats || {};

  // Activate key form
  const form = useForm<ActivateKeyFormData>({
    resolver: zodResolver(activateKeySchema),
    defaultValues: {
      key: "",
    },
  });

  // Activate license mutation
  const activateMutation = useMutation({
    mutationFn: (data: ActivateKeyFormData) => apiRequest("POST", "/api/licenses/activate", data),
    onSuccess: () => {
      toast({
        title: "Licença ativada",
        description: "Sua licença foi ativada com sucesso!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setShowActivateForm(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro na ativação",
        description: error.message || "Falha ao ativar licença",
        variant: "destructive",
      });
    },
  });

  // Download cheat mutation
  const downloadMutation = useMutation({
    mutationFn: () => apiRequest("GET", "/api/download/cheat"),
    onSuccess: (data: any) => {
      // Trigger actual file download
      const downloadUrl = (data as any).downloadUrl;
      const fileName = (data as any).fileName;
      
      // Create a temporary link and click it to start download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download iniciado",
        description: `${fileName} está sendo baixado...`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Download negado",
        description: error.message || "Licença inválida ou expirada",
        variant: "destructive",
      });
    },
  });

  const onActivateSubmit = (data: ActivateKeyFormData) => {
    activateMutation.mutate(data);
  };

  // Quick action handlers
  const handleRenewLicense = () => {
    toast({
      title: "Renovação de Licença",
      description: "Redirecionando para a página de preços...",
    });
    window.open("/pricing", "_blank");
  };

  const handleSettings = () => {
    window.location.href = "/settings";
  };

  const handleSupport = () => {
    toast({
      title: "Suporte",
      description: "Redirecionando para o suporte...",
    });
    window.open("/support", "_blank");
  };

  const handleViewManual = () => {
    toast({
      title: "Manual",
      description: "Abrindo manual de configuração...",
    });
    // In a real app, this would open a PDF or documentation page
    window.open("https://docs.fovdark.com/manual", "_blank");
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-20 max-w-6xl">
        <div className="space-y-8">
          <Skeleton className="h-32 w-full" />
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
            <div className="space-y-8">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isLicenseActive = license?.status === "active" && new Date(license.expiresAt) > new Date();
  const isLicensePending = license?.status === "pending";

  return (
    <div className="container mx-auto px-6 py-20 max-w-6xl">
      {/* Welcome Header */}
      <Card className="bg-card/50 backdrop-blur-sm border-primary/20 mb-8">
        <CardContent className="p-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-orbitron font-bold mb-2">
                Bem-vindo, <span className="text-primary">{user?.firstName}</span>
              </h1>
              <p className="text-gray-400">Painel de controle FovDark Premium</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400">Status da Licença</div>
              <div className="flex items-center mt-1">
                {isLicenseActive ? (
                  <>
                    <span className="w-3 h-3 bg-primary rounded-full mr-2 animate-pulse"></span>
                    <span className="text-primary font-semibold">ATIVA</span>
                  </>
                ) : isLicensePending ? (
                  <>
                    <span className="w-3 h-3 bg-yellow-500 rounded-full mr-2 animate-pulse"></span>
                    <span className="text-yellow-500 font-semibold">PENDENTE</span>
                  </>
                ) : (
                  <>
                    <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                    <span className="text-red-500 font-semibold">
                      {license ? "EXPIRADA" : "INATIVA"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* License Info */}
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center text-2xl font-orbitron">
                <Key className="text-primary mr-3" />
                Informações da Licença
              </CardTitle>
            </CardHeader>
            <CardContent>
              {license ? (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Chave de Ativação</div>
                    <div className="font-mono text-lg break-all">{license.key}</div>
                  </div>
                  
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">HWID Registrado</div>
                    <div className="font-mono text-sm break-all">{license.hwid || "Não definido"}</div>
                  </div>
                  
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Tempo Restante</div>
                    <div className="text-lg font-mono">
                      {license.daysRemaining || 0}d {license.hoursRemaining || 0}h {license.minutesRemaining || 0}m
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Expires: {new Date(license.expiresAt).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Tipo de Plano</div>
                    <Badge variant="secondary" className="text-yellow-400">
                      {license.plan.toUpperCase()}
                    </Badge>
                    <div className="text-xs text-gray-500 mt-1">
                      Status: {license.status?.toUpperCase()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">Você ainda não possui uma licença ativa.</p>
                  <div className="flex gap-4 justify-center">
                    <Link href="/payment">
                      <Button className="bg-green-600 hover:bg-green-700">
                        <Download className="w-4 h-4 mr-2" />
                        Comprar Licença PIX
                      </Button>
                    </Link>
                    <Button
                      onClick={() => setShowActivateForm(!showActivateForm)}
                      variant="outline"
                      className="border-primary/20 hover:bg-primary/10"
                    >
                      <Key className="w-4 h-4 mr-2" />
                      Ativar Chave
                    </Button>
                  </div>
                </div>
              )}

              {/* Activate Key Form */}
              {showActivateForm && (
                <div className="mt-6 border-t border-primary/20 pt-6">
                  <h3 className="text-lg font-semibold mb-4">Ativar Chave de Licença</h3>
                  <form onSubmit={form.handleSubmit(onActivateSubmit)} className="space-y-4">
                    <div>
                      <Label htmlFor="key">Chave de Ativação</Label>
                      <Input
                        id="key"
                        placeholder="FOVD-XXXX-XXXX-XXXX"
                        className="bg-background/50 border-primary/20 focus:border-primary"
                        {...form.register("key")}
                      />
                      {form.formState.errors.key && (
                        <p className="text-sm text-red-500 mt-1">{form.formState.errors.key.message}</p>
                      )}
                    </div>
                    
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <Monitor className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <h4 className="text-sm font-medium text-blue-400 mb-1">
                            Hardware ID Automático
                          </h4>
                          <p className="text-xs text-blue-300/80">
                            O HWID (Hardware ID) será coletado automaticamente pelo loader e vinculado à sua licença. 
                            Após ativar, use o loader para finalizar a vinculação ao seu PC.
                          </p>
                        </div>
                      </div>
                    </div>
                    

                    
                    <div className="flex gap-4">
                      <Button
                        type="submit"
                        disabled={activateMutation.isPending}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {activateMutation.isPending ? "Ativando..." : "Ativar Licença"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setShowActivateForm(false)}
                        className="bg-card/50 backdrop-blur-sm"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Features Status */}
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center text-2xl font-orbitron">
                <Settings className="text-neon-blue mr-3" />
                Status dos Recursos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card/50 backdrop-blur-sm p-4 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="text-primary text-xl" />
                    <span className="font-medium">Aimbot</span>
                  </div>
                  <Badge variant="secondary" className="bg-green-500/20 text-green-400">Ativo</Badge>
                </div>

                <div className="bg-card/50 backdrop-blur-sm p-4 rounded-lg border border-primary/20 opacity-60">
                  <div className="flex items-center gap-2 mb-2">
                    <Monitor className="text-gray-500 text-xl" />
                    <span className="font-medium text-gray-500">ESP</span>
                  </div>
                  <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">Em Desenvolvimento</Badge>
                </div>

                <div className="bg-card/50 backdrop-blur-sm p-4 rounded-lg border border-primary/20 opacity-60">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="text-gray-500 text-xl" />
                    <span className="font-medium text-gray-500">Wallhack</span>
                  </div>
                  <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">Em Desenvolvimento</Badge>
                </div>

                <div className="bg-card/50 backdrop-blur-sm p-4 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="text-neon-blue text-xl" />
                    <span className="font-medium">No Recoil</span>
                  </div>
                  <Badge variant="secondary" className={license?.plan === "15days" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>
                    {license?.plan === "15days" ? "Ativo" : "Requer Plano 15 Dias"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Download Section */}
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center text-2xl font-orbitron">
                <Download className="text-accent mr-3" />
                Downloads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-muted rounded-lg p-4">
                  <div className="flex items-center">
                    <Archive className="text-primary text-xl mr-4" />
                    <div>
                      <div className="font-semibold">FovDark Cheat v2.4.1</div>
                      <div className="text-sm text-gray-400">Última atualização: há 2 horas</div>
                    </div>
                  </div>
                  <Button
                    onClick={() => downloadMutation.mutate()}
                    disabled={!isLicenseActive || downloadMutation.isPending}
                    className="bg-primary text-black hover:bg-primary/90 neon-glow"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {downloadMutation.isPending ? "Baixando..." : "Download"}
                  </Button>
                </div>
                
                <div className="flex items-center justify-between bg-muted rounded-lg p-4">
                  <div className="flex items-center">
                    <FileText className="text-yellow-400 text-xl mr-4" />
                    <div>
                      <div className="font-semibold">Manual de Configuração</div>
                      <div className="text-sm text-gray-400">Guia completo de instalação</div>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    className="bg-card/50 backdrop-blur-sm"
                    onClick={handleViewManual}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Ver
                  </Button>
                </div>

                {!isLicenseActive && (
                  <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-lg p-4">
                    <p className="text-yellow-400 text-sm">
                      <Shield className="w-4 h-4 inline mr-2" />
                      Você precisa de uma licença ativa para fazer downloads.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {/* Quick Actions */}
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-orbitron">Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="ghost" 
                className="w-full bg-card/50 backdrop-blur-sm hover:bg-glass-border"
                onClick={handleRenewLicense}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Renovar Licença
              </Button>
              <Button 
                variant="ghost" 
                className="w-full bg-card/50 backdrop-blur-sm hover:bg-glass-border"
                onClick={handleSettings}
              >
                <Settings className="w-4 h-4 mr-2" />
                Configurações
              </Button>
              <Button 
                variant="ghost" 
                className="w-full bg-card/50 backdrop-blur-sm hover:bg-glass-border"
                onClick={handleSupport}
              >
                <Headphones className="w-4 h-4 mr-2" />
                Suporte
              </Button>
            </CardContent>
          </Card>

          {/* Stats */}
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-orbitron">Estatísticas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Total de Downloads</span>
                <span className="font-bold text-primary">{stats.totalDownloads || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Último Download</span>
                <span className="text-sm">
                  {stats.lastDownload ? 
                    new Date(stats.lastDownload).toLocaleDateString("pt-BR") : 
                    "Nunca"
                  }
                </span>
              </div>
              <Separator className="border-primary/20" />
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Conta criada em</span>
                <span className="text-sm">
                  {user?.createdAt ? 
                    new Date(user.createdAt).toLocaleDateString("pt-BR") : 
                    "N/A"
                  }
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-orbitron">Atividade Recente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {downloads.slice(0, 3).map((download: any, index: number) => (
                <div key={index} className="flex items-center text-sm">
                  <span className="w-2 h-2 bg-primary rounded-full mr-3"></span>
                  <span>Download: {download.fileName}</span>
                </div>
              ))}
              
              {license && (
                <div className="flex items-center text-sm">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                  <span>Login efetuado</span>
                </div>
              )}
              
              {license && license.activatedAt && (
                <div className="flex items-center text-sm">
                  <span className="w-2 h-2 bg-neon-yellow rounded-full mr-3"></span>
                  <span>Licença ativada</span>
                </div>
              )}

              {downloads.length === 0 && !license && (
                <p className="text-gray-400 text-sm">Nenhuma atividade recente</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
