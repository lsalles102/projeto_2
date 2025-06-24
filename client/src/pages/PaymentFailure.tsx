import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function PaymentFailure() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-red-900 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <CardTitle className="text-red-600">
            Pagamento Não Aprovado
          </CardTitle>
          <CardDescription>
            Houve um problema com seu pagamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-gray-600">
            Seu pagamento não foi processado com sucesso. Você pode tentar novamente.
          </p>
          
          <div className="space-y-2">
            <Button
              onClick={() => setLocation("/payment")}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Tentar Novamente
            </Button>
            
            <Button
              variant="outline"
              onClick={() => setLocation("/dashboard")}
              className="w-full"
            >
              Voltar ao Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}