import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, Clock } from "lucide-react";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();

  // Verificar autenticação
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  // Buscar dados do dashboard
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ["/api/dashboard"],
    enabled: !!user,
  });

  useEffect(() => {
    if (!userLoading && !user) {
      setLocation("/login");
    }
  }, [user, userLoading, setLocation]);

  if (userLoading || dashboardLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const license = (dashboardData as any)?.license;

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-green-900 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <CardTitle className="text-green-600">Pagamento Aprovado!</CardTitle>
          <CardDescription>
            Sua licença foi ativada automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {license && (
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <h3 className="font-semibold text-green-800 dark:text-green-400 mb-2">
                Detalhes da Licença
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Plano:</span>
                  <span className="font-medium capitalize">{license.plan}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-medium text-green-600">Ativa</span>
                </div>
                <div className="flex justify-between">
                  <span>Tempo restante:</span>
                  <span className="font-medium">
                    {license.daysRemaining}d {license.hoursRemaining}h {license.minutesRemaining}m
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Expira em:</span>
                  <span className="font-medium">
                    {new Date(license.expiresAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-2 text-green-600">
              <Clock className="w-5 h-5" />
              <span className="text-sm">Sua licença está ativa e pronta para uso</span>
            </div>

            <div className="grid gap-3">
              <Button 
                onClick={() => setLocation("/dashboard")} 
                className="bg-green-600 hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Ir para Dashboard e Download
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => setLocation("/")}
              >
                Voltar ao Início
              </Button>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm">
            <p className="font-medium text-blue-800 dark:text-blue-400 mb-2">
              Próximos passos:
            </p>
            <ul className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-300">
              <li>Acesse o dashboard para baixar o cheat</li>
              <li>Siga as instruções de instalação</li>
              <li>Entre em contato pelo suporte se precisar de ajuda</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}