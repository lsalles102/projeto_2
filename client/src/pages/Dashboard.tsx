import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { useLicenseTimer } from "@/hooks/useLicenseTimer";
import { Link, useLocation } from "wouter";
import { 
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

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

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

  // Timer em tempo real para a licença
  const isLicenseCurrentlyActive = (license?.status === "ativa" || license?.license_status === "ativa") && 
                                   (license?.license_expires_at && new Date(license.license_expires_at) > new Date());
  
  const licenseTimer = useLicenseTimer(
    license?.license_remaining_minutes || 0,
    isLicenseCurrentlyActive,
    license?.hwid
  );

  // Download cheat mutation with proper authentication
  const downloadMutation = useMutation({
    mutationFn: async () => {
      // Use apiRequest to ensure token is included
      return await apiRequest("GET", "/api/download/cheat");
    },
    onSuccess: (data: any) => {
      // Trigger actual file download using the secure URL
      const downloadUrl = (data as any).downloadUrl;
      if (downloadUrl) {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = 'FovDarkloader.exe';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      toast({
        title: "Download iniciado",
        description: "O download do loader foi iniciado com sucesso!",
      });
      
      // Invalidate dashboard to update download stats
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro no download",
        description: error.message || "Falha ao baixar o arquivo",
        variant: "destructive",
      });
    },
  });

  // Quick action handlers
  const handleRenewLicense = () => {
    try {
      toast({
        title: "Renovação de Licença",
        description: "Redirecionando para seleção de planos...",
      });
      setLocation("/plans");
    } catch (error) {
      console.error("Erro ao navegar para planos:", error);
      toast({
        title: "Erro",
        description: "Erro ao navegar para planos. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleSettings = () => {
    setLocation("/settings");
  };

  const handleSupport = () => {
    toast({
      title: "Suporte",
      description: "Redirecionando para o suporte...",
    });
    setLocation("/support");
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

  // Usar a variável já definida: isLicenseCurrentlyActive

  return (
    <div className="container mx-auto px-6 py-20 max-w-6xl">
      {/* Welcome Header */}
      <Card className="bg-card/50 backdrop-blur-sm border-primary/20 mb-8">
        <CardContent className="p-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-orbitron font-bold mb-2">
                Bem-vindo, <span className="text-primary">{user?.firstName || user?.username || "Usuário"}</span>
              </h1>
              <p className="text-gray-400">Painel de controle FovDark Premium</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400">Status da Licença</div>
              <div className="flex items-center mt-1">
                {isLicenseCurrentlyActive ? (
                  <>
                    <span className="w-3 h-3 bg-primary rounded-full mr-2 animate-pulse"></span>
                    <span className="text-primary font-semibold">ATIVA</span>
                  </>
                ) : (
                  <>
                    <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                    <span className="text-red-500 font-semibold">
                      {license?.license_status === "expirada" ? "EXPIRADA" : "INATIVA"}
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
                <Shield className="text-primary mr-3" />
                Informações da Licença
              </CardTitle>
            </CardHeader>
            <CardContent>
              {license && license.license_status !== "sem_licenca" ? (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">HWID Registrado</div>
                    <div className="font-mono text-sm break-all">{license.hwid || "Não definido"}</div>
                  </div>
                  
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Tempo Restante</div>
                    <div className="text-lg font-mono">
                      {licenseTimer.days > 0 && (
                        <span className="text-primary">{licenseTimer.days}d </span>
                      )}
                      {(licenseTimer.days > 0 || licenseTimer.hours > 0) && (
                        <span className="text-primary">{licenseTimer.hours}h </span>
                      )}
                      <span className="text-primary">{licenseTimer.minutes}m </span>
                      <span className="text-accent">{licenseTimer.seconds}s</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {licenseTimer.isActive ? (
                        <span className="text-green-400">⏱️ Atualizando em tempo real</span>
                      ) : (
                        <span>Expira: {license.license_expires_at ? new Date(license.license_expires_at).toLocaleDateString("pt-BR") : "N/A"}</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Tipo de Plano</div>
                    <Badge variant="secondary" className="text-yellow-400">
                      {license.license_plan?.toUpperCase() || "N/A"}
                    </Badge>
                    <div className="text-xs text-gray-500 mt-1">
                      Status: {license.license_status?.toUpperCase() || "N/A"}
                    </div>
                  </div>
                  
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Ativação</div>
                    <div className="text-sm">
                      {license.license_activated_at ? new Date(license.license_activated_at).toLocaleDateString("pt-BR") : "Automática após pagamento"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">Você ainda não possui uma licença ativa.</p>
                  <div className="flex gap-4 justify-center">
                    <Button 
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        try {
                          console.log("Clicando em Comprar Licença PIX");
                          toast({
                            title: "Redirecionando",
                            description: "Aguarde, direcionando para seleção de planos...",
                          });
                          setLocation("/plans");
                        } catch (error) {
                          console.error("Erro ao navegar:", error);
                          toast({
                            title: "Erro",
                            description: "Erro ao navegar. Tente novamente.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Comprar Licença PIX
                    </Button>
                  </div>
                  <div className="mt-4 text-sm text-gray-500">
                    Sua licença será ativada automaticamente após a confirmação do pagamento
                  </div>
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
                  <Badge variant="secondary" className={license?.license_plan === "15days" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>
                    {license?.license_plan === "15days" ? "Ativo" : "Requer Plano 15 Dias"}
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
                      <div className="font-semibold">FovDarkloader.exe</div>
                      <div className="text-sm text-gray-400">Última atualização: há 2 horas</div>
                    </div>
                  </div>
                  <Button
                    onClick={() => downloadMutation.mutate()}
                    disabled={!isLicenseCurrentlyActive || downloadMutation.isPending}
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

                {!isLicenseCurrentlyActive && (
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

          {/* User Info */}
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-orbitron">Informações do Usuário</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-3">
                <User className="text-primary text-xl" />
                <div>
                  <div className="font-semibold">{user?.firstName} {user?.lastName}</div>
                  <div className="text-sm text-gray-400">{user?.email}</div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Clock className="text-accent text-xl" />
                <div>
                  <div className="font-semibold">Membro desde</div>
                  <div className="text-sm text-gray-400">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "N/A"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity Stats */}
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-orbitron">Estatísticas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Downloads</span>
                <span className="font-semibold">{downloads.length || 0}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Último Login</span>
                <span className="font-semibold text-sm">Agora</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Status</span>
                <Badge variant="secondary" className="bg-green-500/20 text-green-400">Online</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}