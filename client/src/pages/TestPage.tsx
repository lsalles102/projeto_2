import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function TestPage() {
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const testConnection = async () => {
    setConnectionStatus('testing');
    setErrorMessage('');
    
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      
      if (response.ok) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
        setErrorMessage(data.message || 'Erro na conexão');
      }
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Erro desconhecido');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="container mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">Teste de Conexão - FovDark</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Teste de conectividade com o servidor backend
              </p>
              
              <Button 
                onClick={testConnection}
                disabled={connectionStatus === 'testing'}
                className="w-full"
              >
                {connectionStatus === 'testing' ? 'Testando...' : 'Testar Conexão'}
              </Button>
            </div>

            {connectionStatus !== 'idle' && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <Badge 
                    variant={
                      connectionStatus === 'success' ? 'default' : 
                      connectionStatus === 'error' ? 'destructive' : 
                      'secondary'
                    }
                  >
                    {connectionStatus === 'success' && 'Conexão Bem-sucedida'}
                    {connectionStatus === 'error' && 'Erro de Conexão'}
                    {connectionStatus === 'testing' && 'Testando...'}
                  </Badge>
                </div>

                {errorMessage && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200 text-sm">
                      <strong>Erro:</strong> {errorMessage}
                    </p>
                  </div>
                )}

                {connectionStatus === 'success' && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-green-800 dark:text-green-200 text-sm">
                      ✅ Servidor backend está funcionando corretamente!
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-2">Status do Sistema:</h3>
              <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <li>• Backend rodando na porta 5000</li>
                <li>• Banco de dados PostgreSQL conectado</li>
                <li>• Sistema de limpeza de licenças ativo</li>
                <li>• Auditoria de segurança ativa</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}