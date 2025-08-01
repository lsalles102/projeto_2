import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Crown, Star, Gem } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Pricing() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const plans = [
    {
      name: "TESTE",
      price: "R$ 1,00",
      duration: "30 minutos",
      icon: <Gem className="text-green-500 text-4xl" />,
      features: [
        { name: "Aimbot Color", included: true },
        { name: "Smooth aim configuravel", included: true },
        { name: "FOV customizável", included: true },
        { name: "Configurações personalizadas", included: true },
        { name: "Anti-detecção", included: true },
        { name: "Teste completo", included: true },
      ],
      buttonText: "Testar Agora",
      buttonVariant: "outline" as const,
      planId: "test"
    },
    {
      name: "7 DIAS",
      price: "R$ 9,90",
      duration: "7 dias",
      icon: <Star className="text-orange-500 text-4xl" />,
      features: [
        { name: "Aimbot Color", included: true },
        { name: "Smooth aim configuravel", included: true },
        { name: "FOV customizável", included: true },
        { name: "Configurações personalizadas", included: true },
        { name: "Anti-detecção", included: true },
        { name: "Atualizações automáticas", included: true },
      ],
      buttonText: "Escolher 7 Dias",
      buttonVariant: "ghost" as const,
      planId: "7days"
    },
    {
      name: "15 DIAS",
      price: "R$ 18,90",
      duration: "15 dias",
      icon: <Crown className="text-yellow-400 text-4xl" />,
      popular: true,
      features: [
        { name: "Aimbot Color", included: true },
        { name: "Smooth aim configurável", included: true },
        { name: "FOV customizável", included: true },
        { name: "Configurações personalizadas", included: true },
        { name: "Anti-detecção", included: true },
        { name: "Atualizações automáticas", included: true },
      ],
      buttonText: "Escolher 15 Dias",
      buttonVariant: "default" as const,
      planId: "15days"
    },
  ];

  return (
    <div className="py-20">
      {/* Hero Section */}
      <div className="text-center mb-16 pricing-bg py-16 mx-6 rounded-xl">
        <h1 className="text-5xl font-orbitron font-bold  mb-4">
          PLANOS PREMIUM
        </h1>
        <p className="text-xl text-gray-300">
          Escolha o melhor plano para dominar o BloodStrike
        </p>
      </div>

      <div className="container mx-auto px-6 max-w-6xl">
        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {plans.map((plan, index) => (
            <Card
              key={plan.name}
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
                      {feature.included ? (
                        <Check className="text-primary mr-3 w-5 h-5" />
                      ) : (
                        <X className="text-gray-500 mr-3 w-5 h-5" />
                      )}
                      <span className={feature.included ? "" : "text-gray-500"}>
                        {feature.name}
                      </span>
                    </li>
                  ))}
                </ul>

                {isAuthenticated ? (
                  <Link href={`/payment?plan=${plan.planId}`}>
                    <Button
                      className={`w-full py-3 font-bold transition-all duration-300 ${
                        plan.buttonVariant === "default"
                          ? "bg-primary text-black neon-glow hover:scale-105"
                          : plan.name === "TESTE"
                          ? "bg-green-600 text-white hover:bg-green-700 hover:scale-105"
                          : "bg-gradient-to-r from-purple-600 to-neon-purple text-white hover:scale-105 shadow-lg"
                      }`}
                      variant={plan.buttonVariant}
                    >
                      {plan.name === "15 DIAS" && (
                        <Crown className="w-4 h-4 mr-2" />
                      )}
                      {plan.name === "TESTE" && (
                        <Gem className="w-4 h-4 mr-2" />
                      )}
                      {plan.buttonText}
                    </Button>
                  </Link>
                ) : (
                  <Button
                    className="w-full py-3 font-bold bg-gray-600 text-gray-300 hover:bg-gray-500 transition-colors"
                    onClick={() => navigate("/login")}
                  >
                    Faça login para comprar
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Payment Methods */}
        <div className="text-center mb-16">
          <h3 className="text-2xl font-orbitron font-bold mb-8">
            Método de Pagamento
          </h3>
          <div className="flex justify-center items-center">
            <div className="bg-gradient-to-r from-neon-green/20 to-neon-blue/20 rounded-lg p-6 border border-primary/30">
              <div className="mb-4 flex justify-center">
                <div className="w-16 h-16 flex items-center justify-center">
                  <svg 
                    width="48" 
                    height="48" 
                    viewBox="0 0 64 64" 
                    className="text-primary"
                    fill="currentColor"
                  >
                    <g transform="rotate(45 32 32)">
                      <rect x="8" y="8" width="20" height="20" rx="4" ry="4"/>
                      <rect x="36" y="8" width="20" height="20" rx="4" ry="4"/>
                      <rect x="8" y="36" width="20" height="20" rx="4" ry="4"/>
                      <rect x="36" y="36" width="20" height="20" rx="4" ry="4"/>
                    </g>
                  </svg>
                </div>
              </div>
              <h4 className="text-2xl font-bold text-primary mb-2">PIX</h4>
              <p className="text-gray-300">Pagamento instantâneo e seguro</p>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <h2 className="text-2xl font-orbitron font-bold text-center">
              Perguntas Frequentes sobre Planos
            </h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2">
                  Posso usar em mais de um dispositivo?
                </h4>
                <p className="text-gray-400 text-sm">
                  Não, licença unica serve apenas para um dispositivo.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">
                  Como funcionam os planos de dias?
                </h4>
                <p className="text-gray-400 text-sm">
                  Oferecemos planos de 7 e 15 dias. Após o período, você pode
                  renovar ou escolher outro plano.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">
                  Como funciona o pagamento?
                </h4>
                <p className="text-gray-400 text-sm">
                  Pagamento único por período selecionado. Todas as vendas são
                  finais - não há reembolsos.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2"></h4>
                <p className="text-gray-400 text-sm"></p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">
                  ESP e Wallhack estão disponíveis?
                </h4>
                <p className="text-gray-400 text-sm">
                  ESP e Wallhack estão atualmente em desenvolvimento e
                  manutenção. Serão lançados em breve com sistema anti-detecção
                  aprimorado.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Call to Action */}
        <div className="text-center mt-16">
          <h2 className="text-3xl font-orbitron font-bold mb-4">
            Pronto para começar?
          </h2>
          <p className="text-gray-400 mb-8">
            Junte-se a milhares de jogadores que já dominam o BloodStrike com
            FovDark
          </p>
          <Link href="/register">
            <Button className="px-8 py-4 bg-primary text-black rounded-lg neon-glow font-bold text-lg hover:scale-105 transition-all duration-300">
              CRIAR CONTA GRÁTIS
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
