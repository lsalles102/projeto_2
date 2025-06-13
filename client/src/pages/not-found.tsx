import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-dark-bg">
      <Card className="w-full max-w-md mx-4 glass-effect border-glass-border">
        <CardContent className="pt-6 text-center">
          <div className="flex justify-center mb-6">
            <AlertCircle className="h-16 w-16 text-neon-red" />
          </div>
          
          <h1 className="text-4xl font-orbitron font-bold text-glow mb-4">404</h1>
          <h2 className="text-xl font-semibold text-white mb-2">Página Não Encontrada</h2>
          
          <p className="text-gray-400 mb-8">
            A página que você está procurando não existe ou foi movida.
          </p>

          <div className="space-y-3">
            <Link href="/">
              <Button className="w-full bg-neon-green text-black hover:bg-neon-green/90 font-semibold">
                <Home className="w-4 h-4 mr-2" />
                Voltar ao Início
              </Button>
            </Link>
            
            <Button 
              variant="outline" 
              className="w-full border-glass-border hover:bg-glass-border"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Página Anterior
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
