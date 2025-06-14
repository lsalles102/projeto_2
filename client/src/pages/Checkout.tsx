import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Check, Star, Crown, ExternalLink, CheckCircle, QrCode, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import { initMercadoPago } from "@/lib/mercadopago";

const plans = [
  {
    id: "test",
    name: "TESTE",
    price: "R$ 1,00",
    duration: "30 minutos",
    durationDays: 0.021, // 30 minutos = 0.021 dias (30/1440)
    icon: <Star className="text-green-500 text-4xl" />,
    features: [
      "Aimbot Color para BloodStrike",
      "Smooth aim configurável",
      "FOV customizável", 
      "Configurações personalizadas",
      "Anti-detecção avançada",
      "Teste completo (30 min)"
    ]
  },
  {
    id: "7days",
    name: "7 DIAS",
    price: "R$ 19,90",
    duration: "7 dias",
    durationDays: 7,
    icon: <Star className="text-orange-500 text-4xl" />,
    features: [
      "Aimbot Color para BloodStrike",
      "Smooth aim configurável",
      "FOV customizável", 
      "Configurações personalizadas",
      "Anti-detecção avançada",
      "Atualizações automáticas",
      "Suporte 24/7"
    ]
  },
  {
    id: "15days", 
    name: "15 DIAS",
    price: "R$ 34,90",
    duration: "15 dias",
    durationDays: 15,
    icon: <Crown className="text-yellow-400 text-4xl" />,
    popular: true,
    features: [
      "Aimbot Color para BloodStrike",
      "Smooth aim configurável", 
      "FOV customizável",
      "Configurações personalizadas",
      "Anti-detecção avançada",
      "Atualizações automáticas",
      "Suporte prioritário 24/7",
      "Acesso antecipado a novos recursos"
    ]
  }
];

interface PaymentData {
  paymentId: string;
  preferenceId: string;
  initPoint: string;
  pixQrCode: string;
  pixQrCodeBase64: string;
  amount: number;
  currency: string;
  externalReference: string;
}

export default function Checkout() {
  const [selectedPlan, setSelectedPlan] = useState<typeof plans[0] | null>(null);
  const [step, setStep] = useState<'select' | 'payment' | 'pix'>('select');
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    initMercadoPago().catch(console.error);
    
    // Check for plan parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const planParam = urlParams.get('plan');
    
    if (planParam) {
      const plan = plans.find(p => p.id === planParam);
      if (plan) {
        setSelectedPlan(plan);
        setStep('payment');
      }
    }
  }, []);

  const handleSelectPlan = (plan: typeof plans[0]) => {
    setSelectedPlan(plan);
    setStep('payment');
  };

  const handlePixPayment = async (plan: typeof plans[0]) => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para fazer uma compra",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/payments/pix/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          plan: plan.id,
          durationDays: plan.durationDays,
          payerEmail: user.email,
          payerFirstName: user.firstName,
          payerLastName: user.lastName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao processar pagamento');
      }

      const data = await response.json();
      setPaymentData(data);
      setStep('pix');
      
      toast({
        title: "Pagamento PIX criado",
        description: "Escaneie o QR Code ou copie o código PIX",
      });
      
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao processar pagamento PIX",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyPixCode = () => {
    if (paymentData?.pixQrCode) {
      navigator.clipboard.writeText(paymentData.pixQrCode);
      toast({
        title: "Código PIX copiado!",
        description: "Cole no seu app do banco para fazer o pagamento",
      });
    }
  };

  if (step === 'payment' && selectedPlan) {
    return (
      <ProtectedRoute>
        <div className="py-20 min-h-screen">
          <div className="container mx-auto px-6 max-w-4xl">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-orbitron font-bold mb-4">
                FINALIZAR COMPRA
              </h1>
              <p className="text-gray-300">
                Complete seu pagamento e receba sua chave de ativação
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {selectedPlan.icon}
                    {selectedPlan.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Produto:</span>
                    <span>BloodStrike Cheat</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Plano:</span>
                    <span>{selectedPlan.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Duração:</span>
                    <span>{selectedPlan.duration}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-primary">{selectedPlan.price}</span>
                  </div>

                  <div className="space-y-2 mt-6">
                    <h4 className="font-semibold">Recursos inclusos:</h4>
                    <ul className="space-y-1 text-sm">
                      {selectedPlan.features.map((feature, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-primary" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ExternalLink className="w-5 h-5 text-primary" />
                    PAGAMENTO PIX
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      Como funciona:
                    </h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
                      <li>Clique no botão "Processar Pagamento PIX"</li>
                      <li>Escaneie o QR Code ou copie o código PIX</li>
                      <li>Complete o pagamento no seu app bancário</li>
                      <li>Você receberá sua chave de ativação por email</li>
                      <li>Ative a chave no seu painel de usuário</li>
                    </ol>
                  </div>

                  <div className="space-y-3">
                    <Button
                      className="w-full bg-primary text-black hover:bg-primary/90 font-bold text-lg py-3"
                      onClick={() => handlePixPayment(selectedPlan)}
                    >
                      <ExternalLink className="w-5 h-5 mr-2" />
                      PROCESSAR PAGAMENTO PIX
                    </Button>
                  </div>

                  <div className="text-center">
                    <p className="text-sm text-gray-400 mb-2">
                      Já fez o pagamento?
                    </p>
                    <Link href="/dashboard">
                      <Button variant="ghost">
                        Ir para o Painel e Ativar Chave
                      </Button>
                    </Link>
                  </div>

                  <div className="text-center pt-4">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStep('select');
                        setSelectedPlan(null);
                      }}
                    >
                      ← Voltar aos Planos
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="py-20 min-h-screen">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-orbitron font-bold mb-4">
            ESCOLHA SEU PLANO
          </h1>
          <p className="text-xl text-gray-300">
            Domine o BloodStrike com nossos cheats premium
          </p>
        </div>

        <div className="container mx-auto px-6 max-w-6xl">
          <div className="grid md:grid-cols-2 gap-8 justify-center max-w-4xl mx-auto">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={`bg-card/50 backdrop-blur-sm border-primary/20 hover:scale-105 transition-all duration-300 relative ${
                  plan.popular ? "border-2 border-primary" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-black px-6 py-2 font-bold">
                      MAIS POPULAR
                    </Badge>
                  </div>
                )}

                <CardHeader className="text-center pb-8 pt-8">
                  <div className="mx-auto mb-4">{plan.icon}</div>
                  <h3 className="text-2xl font-orbitron font-bold mb-2">
                    {plan.name}
                  </h3>
                  <div className="text-4xl font-bold text-primary mb-1">
                    {plan.price}
                  </div>
                  <p className="text-gray-400">por {plan.duration}</p>
                </CardHeader>

                <CardContent className="px-8 pb-8">
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center">
                        <Check className="text-primary mr-3 w-5 h-5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full py-3 font-bold bg-primary text-black hover:bg-primary/90 neon-glow"
                    onClick={() => handleSelectPlan(plan)}
                  >
                    {plan.name === "7 DIAS" && <Star className="w-4 h-4 mr-2" />}
                    {plan.name === "15 DIAS" && <Crown className="w-4 h-4 mr-2" />}
                    Escolher {plan.name}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}