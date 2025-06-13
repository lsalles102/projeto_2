import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Send, Mail, MessageCircle, CheckCircle } from "lucide-react";
import { contactSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { z } from "zod";

type ContactFormData = z.infer<typeof contactSchema>;

export default function Support() {
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      message: "",
    },
  });

  const contactMutation = useMutation({
    mutationFn: (data: ContactFormData) => 
      apiRequest("POST", "/api/contact", data),
    onSuccess: () => {
      setIsSuccess(true);
      form.reset();
      toast({
        title: "Mensagem enviada",
        description: "Sua mensagem foi enviada com sucesso! Você receberá uma confirmação por email.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao enviar mensagem. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContactFormData) => {
    contactMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-dark-bg py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 neon-text">
            Suporte FovDark
          </h1>
          <p className="text-gray-400 text-lg">
            Entre em contato conosco para qualquer dúvida ou problema
          </p>
        </div>

        {/* Success Message */}
        {isSuccess && (
          <Alert className="mb-8 border-primary bg-primary/10">
            <CheckCircle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-primary">
              Mensagem enviada com sucesso! Você receberá uma resposta em breve.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          {/* Contact Form */}
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-2xl font-bold neon-text">
                Envie uma Mensagem
              </CardTitle>
              <CardDescription>
                Preencha o formulário abaixo e nossa equipe responderá em breve
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
                    <Input
                      id="name"
                      placeholder="Seu nome"
                      {...form.register("name")}
                      className={form.formState.errors.name ? "border-red-500" : ""}
                    />
                    {form.formState.errors.name && (
                      <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      {...form.register("email")}
                      className={form.formState.errors.email ? "border-red-500" : ""}
                    />
                    {form.formState.errors.email && (
                      <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Assunto *</Label>
                  <Input
                    id="subject"
                    placeholder="Assunto da sua mensagem"
                    {...form.register("subject")}
                    className={form.formState.errors.subject ? "border-red-500" : ""}
                  />
                  {form.formState.errors.subject && (
                    <p className="text-sm text-red-500">{form.formState.errors.subject.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Mensagem *</Label>
                  <Textarea
                    id="message"
                    placeholder="Descreva sua dúvida ou problema em detalhes..."
                    rows={5}
                    {...form.register("message")}
                    className={form.formState.errors.message ? "border-red-500" : ""}
                  />
                  {form.formState.errors.message && (
                    <p className="text-sm text-red-500">{form.formState.errors.message.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full py-3 bg-primary text-black rounded-lg neon-glow font-bold hover:scale-105 transition-all duration-300"
                  disabled={contactMutation.isPending}
                >
                  {contactMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Enviar Mensagem
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Contact Options */}
          <div className="space-y-6">
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 text-center hover:scale-105 transition-all duration-300">
              <CardContent className="p-6">
                <MessageCircle className="text-indigo-500 text-4xl mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Discord</h3>
                <p className="text-gray-400 mb-4">Suporte em tempo real</p>
                <Button 
                  onClick={() => window.open('https://discord.gg/nh6y9k6KVd', '_blank')}
                  className="bg-indigo-600 hover:bg-indigo-700 transition-colors duration-300"
                >
                  Entrar no Discord
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 text-center hover:scale-105 transition-all duration-300">
              <CardContent className="p-6">
                <Mail className="text-primary text-4xl mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Email</h3>
                <p className="text-gray-400 mb-4">contato@suportefovdark.shop</p>
                <Button 
                  onClick={() => window.open('mailto:contato@suportefovdark.shop', '_blank')}
                  className="bg-primary text-black hover:scale-105 transition-all duration-300"
                >
                  Enviar Email
                </Button>
              </CardContent>
            </Card>

            {/* FAQ Section */}
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle className="text-xl font-bold neon-text">
                  Perguntas Frequentes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-bold text-primary mb-2">Como ativar minha licença?</h4>
                  <p className="text-gray-400 text-sm">
                    Acesse seu dashboard e insira a chave de ativação que você recebeu.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-primary mb-2">Problemas de download?</h4>
                  <p className="text-gray-400 text-sm">
                    Verifique se sua licença está ativa e entre em contato se persistir.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-primary mb-2">Tempo de resposta</h4>
                  <p className="text-gray-400 text-sm">
                    Respondemos em até 24-48 horas via email ou Discord.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}