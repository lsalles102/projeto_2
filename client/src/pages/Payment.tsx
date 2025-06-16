import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { QrCode, Shield, Clock, CheckCircle } from "lucide-react";
// SDK do Mercado Pago será carregado via script tag

const paymentSchema = z.object({
  plan: z.enum(["test", "7days", "15days"]),
  payerEmail: z.string().email("Email inválido"),
  payerFirstName: z.string().min(1, "Nome é obrigatório"),
  payerLastName: z.string().min(1, "Sobrenome é obrigatório"),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

const PLAN_INFO = {
  test: {
    name: "Plano Teste",
    price: 1.0,
    duration: 0.021, // 30 minutes in days
    description: "Teste por 30 minutos",
    features: [
      "Acesso completo",
      "Teste de todas as funcionalidades",
      "Aimbot Color",
      "Smooth aim configurável",
    ],
  },
  "7days": {
    name: "Plano 7 Dias",
    price: 19.9,
    duration: 7,
    description: "Acesso por 7 dias",
    features: ["Download liberado", "Atualizações automáticas"],
  },
  "15days": {
    name: "Plano 15 Dias",
    price: 34.9,
    duration: 15,
    description: "Acesso por 15 dias",
    features: [
      "Download liberado",
      "Atualizações automáticas",
      "Melhor custo-benefício",
    ],
  },
};

export default function Payment() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<"test" | "7days" | "15days">(
    "test",
  );
  const [pixData, setPixData] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<
    "form" | "processing" | "qrcode" | "success"
  >("form");

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      plan: "test",
      payerEmail: "",
      payerFirstName: "",
      payerLastName: "",
    },
  });

  // Verificar autenticação
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  // Processar parâmetros da URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const planParam = urlParams.get("plan");

    if (
      planParam &&
      (planParam === "test" || planParam === "7days" || planParam === "15days")
    ) {
      setSelectedPlan(planParam as "test" | "7days" | "15days");
      form.setValue("plan", planParam as "test" | "7days" | "15days");
    }
  }, [form]);

  // Preencher formulário automaticamente quando usuário carregar
  useEffect(() => {
    if (user && typeof user === "object" && "email" in user) {
      const userData = user as any;
      form.setValue("payerEmail", userData.email || "");
      form.setValue("payerFirstName", userData.firstName || "");
      form.setValue("payerLastName", userData.lastName || "");
    }
  }, [user, form]);

  // Carregar SDK do Mercado Pago
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      const existingScript = document.querySelector(
        'script[src="https://sdk.mercadopago.com/js/v2"]',
      );
      if (existingScript) {
        document.body.removeChild(existingScript);
      }
    };
  }, []);

  // Criar pagamento PIX
  const createPaymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      console.log("Enviando dados para API:", data);

      const requestBody = {
        ...data,
        durationDays: PLAN_INFO[data.plan].duration,
      };

      console.log("Corpo da requisição:", requestBody);

      const response = await fetch("/api/payments/create-pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(requestBody),
      });

      console.log("Status da resposta:", response.status);

      if (!response.ok) {
        let errorMessage = "Erro ao criar pagamento";
        try {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } catch {
          // Se não conseguir fazer parse do JSON, usar mensagem baseada no status
          if (response.status === 401) {
            errorMessage = "Você precisa fazer login primeiro";
          } else if (response.status === 403) {
            errorMessage = "Acesso negado";
          } else {
            errorMessage = `Erro do servidor (${response.status})`;
          }
        }
        console.error("Erro da API:", errorMessage);
        throw new Error(errorMessage);
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error("Erro ao fazer parse da resposta:", parseError);
        throw new Error("Resposta inválida do servidor");
      }

      console.log("Resposta da API:", result);
      return result;
    },
    onSuccess: (data) => {
      console.log("Pagamento criado com sucesso:", data);
      console.log("Estrutura dos dados:", JSON.stringify(data, null, 2));
      // Extrair dados do pagamento da resposta
      const paymentData = data.payment || data;
      console.log("Dados do pagamento extraídos:", JSON.stringify(paymentData, null, 2));
      console.log("QR Code Base64 disponível:", !!paymentData.pixQrCodeBase64);
      console.log("QR Code texto disponível:", !!paymentData.pixQrCode);
      setPixData(paymentData);
      setPaymentStatus("qrcode");
      toast({
        title: "Pagamento PIX criado",
        description: "Escaneie o QR Code para realizar o pagamento",
      });
    },
    onError: (error: Error) => {
      console.error("Erro ao criar pagamento:", error);
      setPaymentStatus("form"); // Voltar ao formulário em caso de erro
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Verificar status do pagamento
  const checkPaymentStatus = async (paymentId: string) => {
    const response = await fetch(`/api/payments/${paymentId}/status`, {
      credentials: "include",
    });
    return response.json();
  };

  // Polling para verificar pagamento
  useEffect(() => {
    if (!pixData?.id) return;

    console.log("Iniciando polling para pagamento:", pixData.id);
    
    const interval = setInterval(async () => {
      try {
        console.log("Verificando status do pagamento:", pixData.id);
        
        // Check payment status using payment ID
        const response = await fetch(
          `/api/payments/${pixData.id}/status`,
          {
            credentials: "include",
          },
        );

        if (response.ok) {
          const status = await response.json();
          console.log("Status do pagamento recebido:", status);
          
          if (status.status === "approved" || status.hasActiveLicense) {
            console.log("Pagamento aprovado ou licença ativa detectada!");
            setPaymentStatus("success");
            clearInterval(interval);
            toast({
              title: "Pagamento aprovado!",
              description: "Sua licença foi ativada automaticamente",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          }
        } else {
          console.log("Erro na resposta:", response.status);
        }
      } catch (error) {
        console.error("Erro ao verificar status:", error);
      }
    }, 3000); // Verifica a cada 3 segundos

    return () => {
      console.log("Limpando polling do pagamento");
      clearInterval(interval);
    };
  }, [pixData?.id, queryClient, toast]);

  const onSubmit = (data: PaymentFormData) => {
    console.log("Iniciando criação de pagamento:", data);

    // Validar dados antes de enviar
    if (!data.payerEmail || !data.payerFirstName || !data.payerLastName) {
      toast({
        title: "Erro",
        description: "Todos os campos são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    if (!data.payerEmail.includes("@")) {
      toast({
        title: "Erro",
        description: "Email inválido",
        variant: "destructive",
      });
      return;
    }

    setPaymentStatus("processing");
    createPaymentMutation.mutate(data);
  };

  // Redirecionamento se não autenticado
  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500"></div>
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  if (paymentStatus === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-green-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-green-600">
              Pagamento Aprovado!
            </CardTitle>
            <CardDescription>
              Sua licença foi ativada automaticamente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center space-y-2">
              <p className="text-sm text-gray-600">
                Plano: <strong>{PLAN_INFO[selectedPlan].name}</strong>
              </p>
              <p className="text-sm text-gray-600">
                Duração:{" "}
                <strong>
                  {selectedPlan === "test"
                    ? "30 minutos"
                    : `${PLAN_INFO[selectedPlan].duration} dias`}
                </strong>
              </p>
            </div>
            <Button
              onClick={() => setLocation("/dashboard")}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Ir para Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (paymentStatus === "qrcode" && pixData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-green-900 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-green-600">Pagamento PIX</CardTitle>
            <CardDescription>
              Escaneie o QR Code ou copie o código PIX
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center space-y-4">
              <div className="bg-white p-4 rounded-lg inline-block">
                {pixData.pixQrCodeBase64 ? (
                  <img
                    src={`data:image/png;base64,${pixData.pixQrCodeBase64}`}
                    alt="QR Code PIX"
                    className="w-48 h-48"
                  />
                ) : (
                  <div className="w-48 h-48 bg-gray-200 flex items-center justify-center">
                    <span className="text-gray-500">
                      QR Code não disponível
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Valor: R$ {(pixData.transactionAmount / 100).toFixed(2)}
                </p>
                <p className="text-sm text-gray-600">
                  Plano: {PLAN_INFO[selectedPlan].name}
                </p>
              </div>

              {pixData.pixQrCode && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Código PIX (Copia e Cola):
                  </Label>
                  <div className="relative">
                    <Input
                      value={pixData.pixQrCode}
                      readOnly
                      className="text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute right-1 top-1 h-8"
                      onClick={() => {
                        navigator.clipboard.writeText(pixData.pixQrCode);
                        toast({
                          title: "Copiado!",
                          description:
                            "Código PIX copiado para a área de transferência",
                        });
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 p-4 rounded-lg text-sm">
                <p className="font-medium text-blue-800 mb-2">Instruções:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-700">
                  <li>Abra o app do seu banco</li>
                  <li>Escaneie o QR Code ou cole o código PIX</li>
                  <li>Confirme o pagamento</li>
                  <li>Aguarde a confirmação automática</li>
                </ol>
              </div>

              <div className="flex items-center justify-center space-x-2 text-yellow-600">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Aguardando pagamento...</span>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setPaymentStatus("form");
                setPixData(null);
              }}
              className="w-full"
            >
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-green-900 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle className="text-center text-green-600">
            Adquirir Licença
          </CardTitle>
          <CardDescription className="text-center">
            Escolha seu plano e efetue o pagamento via PIX
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Seleção do Plano */}
              <div className="grid md:grid-cols-2 gap-4">
                {Object.entries(PLAN_INFO).map(([planKey, plan]) => (
                  <Card
                    key={planKey}
                    className={`cursor-pointer transition-all ${
                      selectedPlan === planKey
                        ? "ring-2 ring-green-500 border-green-500"
                        : "hover:border-green-300"
                    }`}
                    onClick={() => {
                      setSelectedPlan(planKey as "7days" | "15days");
                      form.setValue("plan", planKey as "7days" | "15days");
                    }}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{plan.name}</CardTitle>
                        {planKey === "15days" && (
                          <span className="bg-green-500 text-white text-xs px-2 py-1 rounded">
                            Recomendado
                          </span>
                        )}
                      </div>
                      <div className="text-2xl font-bold text-green-600">
                        R$ {plan.price.toFixed(2)}
                      </div>
                      <CardDescription>{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <ul className="space-y-1">
                        {plan.features.map((feature, index) => (
                          <li key={index} className="text-sm flex items-center">
                            <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Dados do Pagador */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Dados para Pagamento</h3>

                <FormField
                  control={form.control}
                  name="payerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="seu@email.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="payerFirstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome</FormLabel>
                        <FormControl>
                          <Input placeholder="João" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="payerLastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sobrenome</FormLabel>
                        <FormControl>
                          <Input placeholder="Silva" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Resumo e Pagamento */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-medium">Total a pagar:</span>
                  <span className="text-xl font-bold text-green-600">
                    R$ {PLAN_INFO[selectedPlan].price.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center space-x-2 text-sm text-gray-600 mb-4">
                  <Shield className="w-4 h-4" />
                  <span>Pagamento seguro via PIX - Mercado Pago</span>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={
                    createPaymentMutation.isPending ||
                    paymentStatus === "processing"
                  }
                >
                  {createPaymentMutation.isPending ||
                  paymentStatus === "processing" ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4 mr-2" />
                      Pagar com PIX
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
