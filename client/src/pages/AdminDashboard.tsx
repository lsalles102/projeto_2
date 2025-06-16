import { useState } from "react";
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
  Key, 
  CreditCard, 
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

  // Fetch admin dashboard data
  const { data: adminData, isLoading } = useQuery({
    queryKey: ["/api/admin/dashboard"],
  });

  const stats = (adminData as any)?.stats || {};
  const users = (adminData as any)?.users || [];
  const licenses = (adminData as any)?.licenses || [];
  const activationKeys = (adminData as any)?.activationKeys || [];

  // Create activation keys form
  const createKeyForm = useForm<CreateKeyFormData>({
    resolver: zodResolver(createActivationKeySchema),
    defaultValues: {
      plan: "basic",
      durationDays: 30,
      quantity: 1,
    },
  });

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

  // Mutations
  const createKeysMutation = useMutation({
    mutationFn: (data: CreateKeyFormData) => apiRequest("POST", "/api/admin/keys", data),
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Chaves criadas com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      createKeyForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar chaves",
        variant: "destructive",
      });
    },
  });

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

  const deleteLicenseMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/licenses/${id}`),
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Licença deletada!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao deletar licença",
        variant: "destructive",
      });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/keys/${id}`),
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Chave deletada!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao deletar chave",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const statusColors = {
      active: "bg-green-500",
      inactive: "bg-gray-500",
      expired: "bg-red-500",
      revoked: "bg-orange-500",
    };
    return (
      <Badge className={`${statusColors[status as keyof typeof statusColors]} text-white`}>
        {status}
      </Badge>
    );
  };

  const getPlanBadge = (plan: string) => {
    const planColors = {
      basic: "bg-blue-500",
      premium: "bg-purple-500",
      vip: "bg-gold-500",
    };
    return (
      <Badge className={`${planColors[plan as keyof typeof planColors] || "bg-gray-500"} text-white`}>
        {plan}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neon-green mx-auto mb-4"></div>
          <p className="text-gray-400">Carregando dashboard administrativo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neon-green">Dashboard Administrativo</h1>
          <p className="text-gray-400">Gerencie usuários, licenças e chaves de ativação</p>
        </div>
        <Shield className="h-8 w-8 text-neon-purple" />
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card className="bg-dark-surface border-glass-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Usuários</CardTitle>
            <Users className="h-4 w-4 text-neon-green" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.totalUsers || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-dark-surface border-glass-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Licenças</CardTitle>
            <CreditCard className="h-4 w-4 text-neon-purple" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.totalLicenses || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-dark-surface border-glass-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Licenças Ativas</CardTitle>
            <BarChart3 className="h-4 w-4 text-neon-yellow" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.activeLicenses || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-dark-surface border-glass-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Chaves</CardTitle>
            <Key className="h-4 w-4 text-neon-red" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.totalActivationKeys || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-dark-surface border-glass-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Chaves Não Usadas</CardTitle>
            <Key className="h-4 w-4 text-neon-green" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.unusedActivationKeys || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-dark-surface border-glass-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Downloads</CardTitle>
            <Download className="h-4 w-4 text-neon-purple" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.totalDownloads || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-dark-surface">
          <TabsTrigger value="users" className="data-[state=active]:bg-neon-green data-[state=active]:text-black">
            Usuários
          </TabsTrigger>
          <TabsTrigger value="licenses" className="data-[state=active]:bg-neon-green data-[state=active]:text-black">
            Licenças
          </TabsTrigger>
          <TabsTrigger value="keys" className="data-[state=active]:bg-neon-green data-[state=active]:text-black">
            Chaves de Ativação
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card className="bg-dark-surface border-glass-border">
            <CardHeader>
              <CardTitle className="text-neon-green">Gerenciamento de Usuários</CardTitle>
              <CardDescription className="text-gray-400">
                Visualize e gerencie todos os usuários do sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-glass-border">
                    <TableHead className="text-gray-400">ID</TableHead>
                    <TableHead className="text-gray-400">Email</TableHead>
                    <TableHead className="text-gray-400">Nome</TableHead>
                    <TableHead className="text-gray-400">Admin</TableHead>
                    <TableHead className="text-gray-400">Criado em</TableHead>
                    <TableHead className="text-gray-400">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user: any) => (
                    <TableRow key={user.id} className="border-glass-border">
                      <TableCell className="text-white">{user.id}</TableCell>
                      <TableCell className="text-white">{user.email}</TableCell>
                      <TableCell className="text-white">
                        {user.firstName} {user.lastName}
                      </TableCell>
                      <TableCell>
                        {user.isAdmin ? (
                          <Badge className="bg-neon-purple text-white">Admin</Badge>
                        ) : (
                          <Badge variant="secondary">Usuário</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-400">
                        {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setSelectedUser(user);
                                  updateUserForm.reset({
                                    firstName: user.firstName,
                                    lastName: user.lastName,
                                    email: user.email,
                                    isAdmin: user.isAdmin,
                                  });
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-dark-surface border-glass-border">
                              <DialogHeader>
                                <DialogTitle className="text-neon-green">Editar Usuário</DialogTitle>
                                <DialogDescription className="text-gray-400">
                                  Atualize as informações do usuário
                                </DialogDescription>
                              </DialogHeader>
                              <Form {...updateUserForm}>
                                <form 
                                  onSubmit={updateUserForm.handleSubmit((data) => 
                                    updateUserMutation.mutate({ id: user.id, data })
                                  )}
                                  className="space-y-4"
                                >
                                  <FormField
                                    control={updateUserForm.control}
                                    name="firstName"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-gray-400">Nome</FormLabel>
                                        <FormControl>
                                          <Input {...field} className="bg-dark-bg border-glass-border text-white" />
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
                                        <FormLabel className="text-gray-400">Sobrenome</FormLabel>
                                        <FormControl>
                                          <Input {...field} className="bg-dark-bg border-glass-border text-white" />
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
                                        <FormLabel className="text-gray-400">Email</FormLabel>
                                        <FormControl>
                                          <Input {...field} type="email" className="bg-dark-bg border-glass-border text-white" />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={updateUserForm.control}
                                    name="isAdmin"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-gray-400">Tipo de Usuário</FormLabel>
                                        <Select onValueChange={(value) => field.onChange(value === "true")} value={field.value?.toString()}>
                                          <FormControl>
                                            <SelectTrigger className="bg-dark-bg border-glass-border text-white">
                                              <SelectValue />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent className="bg-dark-surface border-glass-border">
                                            <SelectItem value="false" className="text-white">Usuário</SelectItem>
                                            <SelectItem value="true" className="text-white">Administrador</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <Button 
                                    type="submit" 
                                    className="w-full bg-neon-green text-black hover:bg-neon-green/80"
                                    disabled={updateUserMutation.isPending}
                                  >
                                    {updateUserMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                                  </Button>
                                </form>
                              </Form>
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
          <Card className="bg-dark-surface border-glass-border">
            <CardHeader>
              <CardTitle className="text-neon-green">Gerenciamento de Licenças</CardTitle>
              <CardDescription className="text-gray-400">
                Visualize e gerencie todas as licenças do sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-glass-border">
                    <TableHead className="text-gray-400">ID</TableHead>
                    <TableHead className="text-gray-400">Usuário</TableHead>
                    <TableHead className="text-gray-400">Chave</TableHead>
                    <TableHead className="text-gray-400">Plano</TableHead>
                    <TableHead className="text-gray-400">Status</TableHead>
                    <TableHead className="text-gray-400">Tempo Restante</TableHead>
                    <TableHead className="text-gray-400">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {licenses.map((license: any) => {
                    const user = users.find((u: any) => u.id === license.userId);
                    return (
                      <TableRow key={license.id} className="border-glass-border">
                        <TableCell className="text-white">{license.id}</TableCell>
                        <TableCell className="text-white">
                          {user ? `${user.firstName} ${user.lastName}` : "N/A"}
                        </TableCell>
                        <TableCell className="text-white font-mono text-sm">{license.key}</TableCell>
                        <TableCell>{getPlanBadge(license.plan)}</TableCell>
                        <TableCell>{getStatusBadge(license.status)}</TableCell>
                        <TableCell className="text-white">
                          <div className="flex items-center space-x-1">
                            <Clock className="h-4 w-4 text-gray-400" />
                            <span>
                              {license.daysRemaining}d {license.hoursRemaining}h {license.minutesRemaining}m
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    setSelectedLicense(license);
                                    updateLicenseForm.reset({
                                      status: license.status,
                                      daysRemaining: license.daysRemaining,
                                      hoursRemaining: license.hoursRemaining,
                                      minutesRemaining: license.minutesRemaining,
                                    });
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="bg-dark-surface border-glass-border">
                                <DialogHeader>
                                  <DialogTitle className="text-neon-green">Editar Licença</DialogTitle>
                                  <DialogDescription className="text-gray-400">
                                    Atualize o status e tempo restante da licença
                                  </DialogDescription>
                                </DialogHeader>
                                <Form {...updateLicenseForm}>
                                  <form 
                                    onSubmit={updateLicenseForm.handleSubmit((data) => 
                                      updateLicenseMutation.mutate({ id: license.id, data })
                                    )}
                                    className="space-y-4"
                                  >
                                    <FormField
                                      control={updateLicenseForm.control}
                                      name="status"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className="text-gray-400">Status</FormLabel>
                                          <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                              <SelectTrigger className="bg-dark-bg border-glass-border text-white">
                                                <SelectValue />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-dark-surface border-glass-border">
                                              <SelectItem value="inactive" className="text-white">Inativa</SelectItem>
                                              <SelectItem value="active" className="text-white">Ativa</SelectItem>
                                              <SelectItem value="expired" className="text-white">Expirada</SelectItem>
                                              <SelectItem value="revoked" className="text-white">Revogada</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                    <div className="grid grid-cols-3 gap-4">
                                      <FormField
                                        control={updateLicenseForm.control}
                                        name="daysRemaining"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-gray-400">Dias</FormLabel>
                                            <FormControl>
                                              <Input 
                                                {...field} 
                                                type="number" 
                                                min="0"
                                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                                className="bg-dark-bg border-glass-border text-white" 
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={updateLicenseForm.control}
                                        name="hoursRemaining"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-gray-400">Horas</FormLabel>
                                            <FormControl>
                                              <Input 
                                                {...field} 
                                                type="number" 
                                                min="0" 
                                                max="23"
                                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                                className="bg-dark-bg border-glass-border text-white" 
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={updateLicenseForm.control}
                                        name="minutesRemaining"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className="text-gray-400">Minutos</FormLabel>
                                            <FormControl>
                                              <Input 
                                                {...field} 
                                                type="number" 
                                                min="0" 
                                                max="59"
                                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                                className="bg-dark-bg border-glass-border text-white" 
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                    <Button 
                                      type="submit" 
                                      className="w-full bg-neon-green text-black hover:bg-neon-green/80"
                                      disabled={updateLicenseMutation.isPending}
                                    >
                                      {updateLicenseMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                                    </Button>
                                  </form>
                                </Form>
                              </DialogContent>
                            </Dialog>
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => deleteLicenseMutation.mutate(license.id)}
                              disabled={deleteLicenseMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activation Keys Tab */}
        <TabsContent value="keys" className="space-y-4">
          <Card className="bg-dark-surface border-glass-border">
            <CardHeader>
              <CardTitle className="text-neon-green">Criar Chaves de Ativação</CardTitle>
              <CardDescription className="text-gray-400">
                Gere novas chaves de ativação para distribuição
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...createKeyForm}>
                <form 
                  onSubmit={createKeyForm.handleSubmit((data) => createKeysMutation.mutate(data))}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={createKeyForm.control}
                      name="plan"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-400">Plano</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-dark-bg border-glass-border text-white">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-dark-surface border-glass-border">
                              <SelectItem value="basic" className="text-white">Básico</SelectItem>
                              <SelectItem value="premium" className="text-white">Premium</SelectItem>
                              <SelectItem value="vip" className="text-white">VIP</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createKeyForm.control}
                      name="durationDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-400">Duração (dias)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              min="1" 
                              max="365"
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                              className="bg-dark-bg border-glass-border text-white" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createKeyForm.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-400">Quantidade</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              min="1" 
                              max="100"
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                              className="bg-dark-bg border-glass-border text-white" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="bg-neon-green text-black hover:bg-neon-green/80"
                    disabled={createKeysMutation.isPending}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {createKeysMutation.isPending ? "Criando..." : "Criar Chaves"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="bg-dark-surface border-glass-border">
            <CardHeader>
              <CardTitle className="text-neon-green">Chaves de Ativação Existentes</CardTitle>
              <CardDescription className="text-gray-400">
                Visualize e gerencie todas as chaves de ativação
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-glass-border">
                    <TableHead className="text-gray-400">ID</TableHead>
                    <TableHead className="text-gray-400">Chave</TableHead>
                    <TableHead className="text-gray-400">Plano</TableHead>
                    <TableHead className="text-gray-400">Duração</TableHead>
                    <TableHead className="text-gray-400">Status</TableHead>
                    <TableHead className="text-gray-400">Usado por</TableHead>
                    <TableHead className="text-gray-400">Criado em</TableHead>
                    <TableHead className="text-gray-400">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activationKeys.map((key: any) => {
                    const usedByUser = key.usedBy ? users.find((u: any) => u.id === key.usedBy) : null;
                    return (
                      <TableRow key={key.id} className="border-glass-border">
                        <TableCell className="text-white">{key.id}</TableCell>
                        <TableCell className="text-white font-mono text-sm">{key.key}</TableCell>
                        <TableCell>{getPlanBadge(key.plan)}</TableCell>
                        <TableCell className="text-white">{key.durationDays} dias</TableCell>
                        <TableCell>
                          {key.isUsed ? (
                            <Badge className="bg-red-500 text-white">Usada</Badge>
                          ) : (
                            <Badge className="bg-green-500 text-white">Disponível</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-white">
                          {usedByUser ? `${usedByUser.firstName} ${usedByUser.lastName}` : "N/A"}
                        </TableCell>
                        <TableCell className="text-gray-400">
                          {new Date(key.createdAt).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => deleteKeyMutation.mutate(key.id)}
                            disabled={deleteKeyMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}