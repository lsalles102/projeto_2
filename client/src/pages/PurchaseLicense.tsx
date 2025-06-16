import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Check, Copy, QrCode, Timer } from "lucide-react";
import { createPixPaymentSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";

const formSchema = createPixPaymentSchema;

const PLANS = {
  basic: {
    name: "Básico",
    price: 29.99,
    features: ["Acesso completo", "Suporte básico", "Updates automáticos"],
    badge: "Popular",
    color: "bg-blue-500"
  },
  premium: {
    name: "Premium",
    price: 49.99,
    features: ["Acesso completo", "Suporte prioritário", "Updates automáticos", "Configurações avançadas"],
    badge: "Recomendado",
    color: "bg-green-500"
  },
  vip: {
    name: "VIP",
    price: 99.99,
    features: ["Acesso completo", "Suporte 24/7", "Updates automáticos", "Configurações avançadas", "Acesso antecipado"],
    badge: "Premium",
    color: "bg-purple-500"
  }
};

interface PixPaymentResponse {
  paymentId: number;
  preferenceId: string;
  initPoint: string;
  pixQrCode: string;
  pixQrCodeBase64: string;
  amount: number;
  currency: string;
  externalReference: string;
}

export default function PurchaseLicense() {
  const [selectedPlan, setSelectedPlan] = useState<"basic" | "premium" | "vip">("premium");
  const [paymentResponse, setPaymentResponse] = useState<PixPaymentResponse | null>(null);
  const [paymentStep, setPaymentStep] = useState<"form" | "payment" | "success">("form");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      plan: "premium",
      durationDays: 30,
      payerEmail: "",
      payerFirstName: "",
      payerLastName: "",
    },
  });

  // Verificar status do pagamento periodicamente
  const { data: paymentStatus } = useQuery({
    queryKey: ["payment-status", paymentResponse?.paymentId],
    queryFn: () => paymentResponse ? apiRequest(`/api/payments/${paymentResponse.paymentId}/status`) : null,
    enabled: !!paymentResponse && paymentStep === "payment",
    refetchInterval: 3000, // Verificar a cada 3 segundos
  });

  const createPaymentMutation = useMutation({
    mutationFn: (data: z.infer<typeof formSchema>) => 
      apiRequest("/api/payments/pix/create", { method: "POST", body: data }),
    onSuccess: (response: PixPaymentResponse) => {
      setPaymentResponse(response);
      setPaymentStep("payment");
      toast({
        title: "Pagamento PIX criado",
        description: "Escaneie o QR Code ou copie o código PIX para efetuar o pagamento",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar pagamento",
        description: error.message || "Ocorreu um erro inesperado",
        variant: "destructive",
      });
    },
  });

  // Monitorar mudança de status do pagamento
  if (paymentStatus?.status === "approved" && paymentStep === "payment") {
    setPaymentStep("success");
    toast({
      title: "Pagamento aprovado!",
      description: "Sua licença foi ativada com sucesso",
    });
  }

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createPaymentMutation.mutate({
      ...values,
      plan: selectedPlan,
    });
  };

  const copyPixCode = () => {
    if (paymentResponse?.pixQrCode) {
      navigator.clipboard.writeText(paymentResponse.pixQrCode);
      toast({
        title: "Código PIX copiado!",
        description: "Cole no seu app do banco para fazer o pagamento",
      });
    }
  };

  if (paymentStep === "success") {
    return (
      <div className="container mx-auto p-6">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-green-600">Pagamento Aprovado!</CardTitle>
            <CardDescription>
              Sua licença foi ativada com sucesso
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Você pode agora fazer o download do software na área do usuário.
            </p>
            <Button onClick={() => window.location.href = "/dashboard"} className="w-full">
              Ir para Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (paymentStep === "payment" && paymentResponse) {
    return (
      <div className="container mx-auto p-6">
        <Card className="max-w-lg mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <QrCode className="w-5 h-5" />
              Pagamento PIX
            </CardTitle>
            <CardDescription>
              Escaneie o QR Code ou copie o código PIX
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* QR Code */}
            {paymentResponse.pixQrCodeBase64 && (
              <div className="text-center">
                <img
                  src={`data:image/png;base64,${paymentResponse.pixQrCodeBase64}`}
                  alt="QR Code PIX"
                  className="mx-auto border rounded-lg"
                  style={{ maxWidth: "200px" }}
                />
              </div>
            )}

            {/* Detalhes do pagamento */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Valor:</span>
                <span className="font-medium">R$ {paymentResponse.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Plano:</span>
                <span className="font-medium">{PLANS[selectedPlan].name}</span>
              </div>
            </div>

            <Separator />

            {/* Código PIX para copiar */}
            {paymentResponse.pixQrCode && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Código PIX (Copia e Cola):</label>
                <div className="flex gap-2">
                  <Input
                    value={paymentResponse.pixQrCode}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button onClick={copyPixCode} size="sm" variant="outline">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Status */}
            <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <Timer className="w-5 h-5 mx-auto mb-2 text-yellow-600" />
              <p className="text-sm text-yellow-800">
                Aguardando confirmação do pagamento...
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                O pagamento será confirmado automaticamente
              </p>
            </div>

            <Button 
              onClick={() => setPaymentStep("form")} 
              variant="outline" 
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
    <div className="container mx-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Adquirir Licença</h1>
          <p className="text-muted-foreground">
            Escolha seu plano e efetue o pagamento via PIX
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Seleção de planos */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold mb-4">Escolha seu plano</h2>
            {Object.entries(PLANS).map(([key, plan]) => (
              <Card 
                key={key}
                className={`cursor-pointer transition-all ${
                  selectedPlan === key 
                    ? 'ring-2 ring-primary' 
                    : 'hover:shadow-md'
                }`}
                onClick={() => setSelectedPlan(key as "basic" | "premium" | "vip")}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <Badge className={plan.color}>{plan.badge}</Badge>
                  </div>
                  <CardDescription className="text-2xl font-bold text-foreground">
                    R$ {plan.price.toFixed(2)}
                    <span className="text-sm font-normal text-muted-foreground">/30 dias</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Formulário de dados */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="w-5 h-5" />
                  Dados para Pagamento
                </CardTitle>
                <CardDescription>
                  Preencha seus dados para gerar o PIX
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="payerFirstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome</FormLabel>
                          <FormControl>
                            <Input placeholder="Seu primeiro nome" {...field} />
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
                            <Input placeholder="Seu sobrenome" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="payerEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>E-mail</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="seu@email.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="durationDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Duração</FormLabel>
                          <Select 
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            defaultValue={field.value.toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione a duração" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="7">7 dias</SelectItem>
                              <SelectItem value="15">15 dias</SelectItem>
                              <SelectItem value="30">30 dias</SelectItem>
                              <SelectItem value="60">60 dias</SelectItem>
                              <SelectItem value="90">90 dias</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Plano selecionado:</span>
                        <span className="font-medium">{PLANS[selectedPlan].name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Duração:</span>
                        <span className="font-medium">{form.watch("durationDays")} dias</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total:</span>
                        <span>R$ {PLANS[selectedPlan].price.toFixed(2)}</span>
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={createPaymentMutation.isPending}
                    >
                      {createPaymentMutation.isPending ? "Gerando PIX..." : "Gerar PIX"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}