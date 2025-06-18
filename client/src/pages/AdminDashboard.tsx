import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { updateUserSchema, updateLicenseSchema } from "@shared/schema";
import { 
  Users, 
  QrCode, 
  BarChart3, 
  Trash2, 
  Edit, 
  Plus,
  Shield,
  Clock,
  Download
} from "lucide-react";

type UpdateUserFormData = z.infer<typeof updateUserSchema>;
type UpdateLicenseFormData = z.infer<typeof updateLicenseSchema>;

export default function AdminDashboard() {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedLicense, setSelectedLicense] = useState<any>(null);
  const [downloadUrl, setDownloadUrl] = useState("");

  // Fetch admin dashboard data
  const { data: adminData, isLoading } = useQuery({
    queryKey: ["/api/admin/dashboard"],
  });

  const stats = (adminData as any)?.stats || {};
  const users = (adminData as any)?.users || [];
  const licenses = (adminData as any)?.licenses || [];
  const currentDownloadUrl = (adminData as any)?.settings?.downloadUrl || "";

  // Set initial download URL when data loads
  useEffect(() => {
    if (currentDownloadUrl && !downloadUrl) {
      setDownloadUrl(currentDownloadUrl);
    }
  }, [currentDownloadUrl]);

  // Update user form
  const updateUserForm = useForm<UpdateUserFormData>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {},
  });

  // Update license form
  const updateLicenseForm = useForm<UpdateLicenseFormData>({
    resolver: zodResolver(updateLicenseSchema),
    defaultValues: {},
  });

  // Update download URL mutation
  const updateDownloadUrlMutation = useMutation({
    mutationFn: () => 
      apiRequest("POST", "/api/admin/settings/download-url", { downloadUrl }),
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Link de download atualizado!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setDownloadUrl("");
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar link de download",
        variant: "destructive",
      });
    },
  });

  // Mutations
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserFormData }) => 
      apiRequest("PATCH", `/api/admin/users/${id}`, data),
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Usuário atualizado!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar usuário",
        variant: "destructive",
      });
    },
  });

  const updateLicenseMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateLicenseFormData }) => 
      apiRequest("PATCH", `/api/admin/licenses/${id}`, data),
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Licença atualizada!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setSelectedLicense(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar licença",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Usuário deletado!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao deletar usuário",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const statusColors = {
      ativa: "bg-green-500",
      sem_licenca: "bg-gray-500",
      expirada: "bg-red-500",
    };
    return (
      <Badge className={`${statusColors[status as keyof typeof statusColors] || "bg-gray-500"} text-white`}>
        {status}
      </Badge>
    );
  };

  const getPlanBadge = (plan: string) => {
    const planColors = {
      test: "bg-blue-500",
      "7days": "bg-purple-500",
      "15days": "bg-gold-500",
    };
    return (
      <Badge className={`${planColors[plan as keyof typeof planColors] || "bg-gray-500"} text-white`}>
        {plan}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-20 max-w-7xl">
        <div className="text-center">Carregando painel administrativo...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-20 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-orbitron font-bold mb-2">Painel Administrativo</h1>
        <p className="text-gray-400">Gerenciamento completo do sistema FovDark</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Total de Usuários</p>
                <p className="text-2xl font-bold text-primary">{stats.totalUsers || 0}</p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Licenças Ativas</p>
                <p className="text-2xl font-bold text-green-400">{stats.activeLicenses || 0}</p>
              </div>
              <Shield className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Receita Mensal</p>
                <p className="text-2xl font-bold text-blue-400">R$ {stats.monthlyRevenue || "0,00"}</p>
              </div>
              <QrCode className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Downloads Hoje</p>
                <p className="text-2xl font-bold text-accent">{stats.downloadsToday || 0}</p>
              </div>
              <Download className="h-8 w-8 text-accent" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="licenses">Licenças</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-primary">Gerenciar Usuários</CardTitle>
              <CardDescription className="text-gray-400">
                Visualize e gerencie todos os usuários registrados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-primary/20">
                    <TableHead className="text-gray-400">ID</TableHead>
                    <TableHead className="text-gray-400">Nome</TableHead>
                    <TableHead className="text-gray-400">Email</TableHead>
                    <TableHead className="text-gray-400">Status da Licença</TableHead>
                    <TableHead className="text-gray-400">Plano</TableHead>
                    <TableHead className="text-gray-400">Registro</TableHead>
                    <TableHead className="text-gray-400">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user: any) => (
                    <TableRow key={user.id} className="border-primary/20">
                      <TableCell className="text-white">{user.id}</TableCell>
                      <TableCell className="text-white">
                        {user.firstName} {user.lastName}
                      </TableCell>
                      <TableCell className="text-white">{user.email}</TableCell>
                      <TableCell>
                        {getStatusBadge(user.license_status || "sem_licenca")}
                      </TableCell>
                      <TableCell>
                        {user.license_plan ? getPlanBadge(user.license_plan) : "N/A"}
                      </TableCell>
                      <TableCell className="text-gray-400">
                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setSelectedUser(user)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-card border-primary/20">
                              <DialogHeader>
                                <DialogTitle>Editar Usuário</DialogTitle>
                                <DialogDescription>
                                  Atualize as informações do usuário
                                </DialogDescription>
                              </DialogHeader>
                              {selectedUser && (
                                <Form {...updateUserForm}>
                                  <form 
                                    onSubmit={updateUserForm.handleSubmit((data) => 
                                      updateUserMutation.mutate({ id: selectedUser.id, data })
                                    )}
                                    className="space-y-4"
                                  >
                                    <FormField
                                      control={updateUserForm.control}
                                      name="firstName"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Nome</FormLabel>
                                          <FormControl>
                                            <Input {...field} defaultValue={selectedUser.firstName} />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={updateUserForm.control}
                                      name="lastName"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Sobrenome</FormLabel>
                                          <FormControl>
                                            <Input {...field} defaultValue={selectedUser.lastName} />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={updateUserForm.control}
                                      name="email"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Email</FormLabel>
                                          <FormControl>
                                            <Input {...field} defaultValue={selectedUser.email} />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                    <Button 
                                      type="submit" 
                                      className="bg-primary hover:bg-primary/90"
                                      disabled={updateUserMutation.isPending}
                                    >
                                      {updateUserMutation.isPending ? "Atualizando..." : "Atualizar"}
                                    </Button>
                                  </form>
                                </Form>
                              )}
                            </DialogContent>
                          </Dialog>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => deleteUserMutation.mutate(user.id)}
                            disabled={deleteUserMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Licenses Tab */}
        <TabsContent value="licenses" className="space-y-4">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-primary">Gerenciar Licenças</CardTitle>
              <CardDescription className="text-gray-400">
                Sistema automático de licenças - ativadas após pagamento confirmado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <h3 className="text-green-400 font-semibold mb-2">Sistema Automático Ativo</h3>
                  <p className="text-sm text-gray-300">
                    As licenças são ativadas automaticamente após confirmação de pagamento PIX.
                    Não é necessário gerenciamento manual de chaves.
                  </p>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow className="border-primary/20">
                      <TableHead className="text-gray-400">Usuário</TableHead>
                      <TableHead className="text-gray-400">Email</TableHead>
                      <TableHead className="text-gray-400">Status</TableHead>
                      <TableHead className="text-gray-400">Plano</TableHead>
                      <TableHead className="text-gray-400">Tempo Restante</TableHead>
                      <TableHead className="text-gray-400">Expira em</TableHead>
                      <TableHead className="text-gray-400">HWID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.filter((user: any) => user.license_status && user.license_status !== "sem_licenca").map((user: any) => (
                      <TableRow key={user.id} className="border-primary/20">
                        <TableCell className="text-white">
                          {user.firstName} {user.lastName}
                        </TableCell>
                        <TableCell className="text-white">{user.email}</TableCell>
                        <TableCell>
                          {getStatusBadge(user.license_status)}
                        </TableCell>
                        <TableCell>
                          {user.license_plan ? getPlanBadge(user.license_plan) : "N/A"}
                        </TableCell>
                        <TableCell className="text-white">
                          {user.license_remaining_minutes ? 
                            `${Math.floor(user.license_remaining_minutes / 1440)}d ${Math.floor((user.license_remaining_minutes % 1440) / 60)}h ${user.license_remaining_minutes % 60}m` 
                            : "N/A"}
                        </TableCell>
                        <TableCell className="text-gray-400">
                          {user.license_expires_at ? 
                            new Date(user.license_expires_at).toLocaleDateString('pt-BR') 
                            : "N/A"}
                        </TableCell>
                        <TableCell className="text-white font-mono text-xs">
                          {user.hwid || "Não definido"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-4">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-primary">Sistema de Pagamentos PIX</CardTitle>
              <CardDescription className="text-gray-400">
                Sistema automático de ativação de licenças após confirmação de pagamento
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <h3 className="text-green-400 font-semibold mb-2">Sistema Automático Ativo</h3>
                  <p className="text-sm text-gray-300">
                    As licenças são ativadas automaticamente após a confirmação do pagamento PIX.
                    Não é mais necessário gerenciar chaves de ativação manualmente.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Pagamentos Hoje</div>
                    <div className="text-2xl font-bold text-green-400">{stats.paymentsToday || 0}</div>
                  </div>
                  
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Receita Total</div>
                    <div className="text-2xl font-bold text-blue-400">R$ {stats.totalRevenue || "0,00"}</div>
                  </div>
                  
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Licenças Ativas</div>
                    <div className="text-2xl font-bold text-primary">{stats.activeLicenses || 0}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-primary">Configurações do Sistema</CardTitle>
              <CardDescription className="text-gray-400">
                Gerencie as configurações globais do sistema FovDark
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Download Link Configuration */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Link de Download</h3>
                  <div className="bg-muted rounded-lg p-4">
                    <Label htmlFor="downloadUrl" className="text-gray-300">
                      URL do Arquivo de Download
                    </Label>
                    <div className="flex gap-3 mt-2">
                      <Input
                        id="downloadUrl"
                        placeholder="https://exemplo.com/arquivo.exe"
                        className="flex-1 bg-background/50 border-primary/20 text-white"
                        value={downloadUrl}
                        onChange={(e) => setDownloadUrl(e.target.value)}
                      />
                      <Button
                        onClick={() => updateDownloadUrlMutation.mutate()}
                        disabled={updateDownloadUrlMutation.isPending || !downloadUrl.trim()}
                        className="bg-primary text-black hover:bg-primary/90"
                      >
                        {updateDownloadUrlMutation.isPending ? "Atualizando..." : "Atualizar"}
                      </Button>
                    </div>
                    <p className="text-sm text-gray-400 mt-2">
                      Este link será usado para todos os downloads de usuários com licenças ativas.
                    </p>
                  </div>
                  
                  {/* Current Download URL Display */}
                  <div className="bg-background/30 rounded-lg p-4">
                    <Label className="text-gray-300">Link Atual:</Label>
                    <p className="text-sm text-white mt-1 break-all">
                      {currentDownloadUrl || "Não configurado"}
                    </p>
                  </div>
                </div>

                {/* System Status */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Status do Sistema</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                      <h4 className="text-green-400 font-semibold">Sistema de Licenças</h4>
                      <p className="text-sm text-gray-300 mt-1">
                        Monitoramento automático ativo
                      </p>
                    </div>
                    
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                      <h4 className="text-blue-400 font-semibold">Pagamentos PIX</h4>
                      <p className="text-sm text-gray-300 mt-1">
                        Webhook configurado e funcional
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}