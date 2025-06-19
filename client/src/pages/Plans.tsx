import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Star, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const plans = [
  {
    id: "test",
    name: "Plano Teste",
    price: 1.0,
    duration: "30 minutos",
    description: "Teste completo do sistema",
    icon: <Zap className="w-6 h-6" />,
    color: "bg-blue-500",
    features: [
      "Acesso completo por 30 minutos",
      "Teste de todas as funcionalidades",
      "Aimbot Color configurável",
      "Smooth aim avançado",
    ],
    popular: false,
  },
  {
    id: "7days",
    name: "Plano 7 Dias",
    price: 14.9,
    duration: "7 dias",
    description: "Ideal para começar",
    icon: <Star className="w-6 h-6" />,
    color: "bg-green-500",
    features: [
      "Acesso completo por 7 dias",
      "Download liberado",
      "Atualizações automáticas",
      "Suporte técnico",
    ],
    popular: true,
  },
  {
    id: "15days",
    name: "Plano 15 Dias",
    price: 29.9,
    duration: "15 dias",
    description: "Melhor custo-benefício",
    icon: <Crown className="w-6 h-6" />,
    color: "bg-purple-500",
    features: [
      "Acesso completo por 15 dias",
      "Download liberado",
      "Atualizações automáticas",
      "Suporte prioritário",
      "Melhor valor",
    ],
    popular: false,
  },
];

export default function Plans() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const handleSelectPlan = (planId: string) => {
    try {
      console.log("Selecionando plano:", planId);
      setSelectedPlan(planId);
      
      toast({
        title: "Plano selecionado",
        description: "Redirecionando para pagamento...",
      });
      
      // Navegar para pagamento com o plano selecionado
      setLocation(`/payment?plan=${planId}`);
    } catch (error) {
      console.error("Erro ao selecionar plano:", error);
      toast({
        title: "Erro",
        description: "Erro ao selecionar plano. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="py-20 min-h-screen">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-orbitron font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            ESCOLHA SEU PLANO
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Selecione o plano ideal para você e tenha acesso completo ao FovDark
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`relative overflow-hidden border-2 transition-all duration-300 hover:scale-105 ${
                plan.popular
                  ? "border-primary bg-primary/5"
                  : "border-muted bg-card/50"
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 left-0 right-0 bg-primary text-black text-center py-2 text-sm font-bold">
                  MAIS POPULAR
                </div>
              )}
              
              <CardHeader className={plan.popular ? "pt-12" : "pt-6"}>
                <div className="flex items-center justify-center mb-4">
                  <div className={`p-3 rounded-full ${plan.color} text-white`}>
                    {plan.icon}
                  </div>
                </div>
                
                <CardTitle className="text-2xl font-orbitron text-center">
                  {plan.name}
                </CardTitle>
                
                <div className="text-center">
                  <div className="text-4xl font-bold text-primary mb-2">
                    R$ {plan.price.toFixed(2)}
                  </div>
                  <div className="text-gray-400">
                    {plan.duration}
                  </div>
                </div>
                
                <p className="text-center text-gray-300 mt-2">
                  {plan.description}
                </p>
              </CardHeader>

              <CardContent className="space-y-4">
                <Button
                  onClick={() => handleSelectPlan(plan.id)}
                  className={`w-full ${
                    plan.popular
                      ? "bg-primary text-black hover:bg-primary/90"
                      : "bg-secondary hover:bg-secondary/90"
                  }`}
                  disabled={selectedPlan === plan.id}
                >
                  {selectedPlan === plan.id ? "Processando..." : "Selecionar Plano"}
                </Button>

                <div className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                      <span className="text-sm text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center">
          <div className="bg-muted/20 rounded-lg p-6 max-w-2xl mx-auto">
            <h3 className="text-xl font-semibold mb-3">Pagamento Seguro via PIX</h3>
            <p className="text-gray-400 text-sm">
              • Ativação automática após confirmação do pagamento<br />
              • Chave de licença enviada por email<br />
              • Suporte técnico incluso<br />
              • Download imediato após ativação
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}