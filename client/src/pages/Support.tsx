import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { contactSchema } from "@shared/schema";
import { z } from "zod";
import {
  Mail,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Send,
  HelpCircle,
  Loader2,
} from "lucide-react";

type ContactFormData = z.infer<typeof contactSchema>;

export default function Support() {
  const { toast } = useToast();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

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
    mutationFn: (data: ContactFormData) => apiRequest("POST", "/api/contact", data),
    onSuccess: () => {
      toast({
        title: "Mensagem enviada com sucesso!",
        description: "Recebemos sua mensagem e responderemos em breve. Você receberá uma confirmação por email.",
      });
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message || "Tente novamente ou entre em contato pelo Discord.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContactFormData) => {
    contactMutation.mutate(data);
  };

  const faqItems = [
    {
      question: "Como ativar minha licença?",
      answer:
        "Após a compra, você receberá uma chave de ativação por email. Entre no painel do usuário e cole a chave no campo indicado. ou Seu HWID será automaticamente vinculado à licença.",
    },
    {
      question: "O cheat é detectável?",
      answer:
        "Nosso sistema anti-detecção é atualizado constantemente . Mantemos uma taxa de detecção praticamente zero através de atualizações automáticas.",
    },
    {
      question: "Posso usar em múltiplos PCs?",
      answer:
        "Cada licença é vinculada a um HWID específico por questões de segurança. Para usar em outro PC, você pode resetar seu HWID através do painel de usuário uma vez por mês.",
    },
    {
      question: "Posso trocar meu HWID?",
      answer:
        "Sim, você pode trocar seu HWID uma vez por mês através do painel de usuário. Esta funcionalidade permite usar sua licença em um computador diferente quando necessário.",
    },
    {
      question: "Que configurações são recomendadas?",
      answer:
        "Recomendamos começar com as configurações padrão e ajustar gradualmente. O manual de configuração disponível no painel tem guias detalhados para cada recurso.",
    },
    {
      question: "O cheat é atualizado automaticamente?",
      answer:
        "Sim, o cheat verifica e baixa atualizações automaticamente. Usuários VIP recebem acesso prioritário às atualizações beta antes do lançamento oficial.",
    },
  ];

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  return (
    <div className="py-20">
      <div className="container mx-auto px-6 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-orbitron font-bold text-glow mb-4">
            SUPORTE
          </h1>
          <p className="text-xl text-gray-300">Estamos aqui para ajudar você</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Contact Form */}
          <Card className="glass-effect border-glass-border">
            <CardHeader>
              <CardTitle className="flex items-center text-2xl font-orbitron">
                <Mail className="text-neon-green mr-3" />
                Enviar Mensagem
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-semibold">
                    Nome
                  </Label>
                  <Input
                    id="name"
                    placeholder="Seu nome"
                    className="bg-dark-surface border-glass-border focus:border-neon-green"
                    {...form.register("name")}
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    className="bg-dark-surface border-glass-border focus:border-neon-green"
                    {...form.register("email")}
                  />
                  {form.formState.errors.email && (
                    <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject" className="text-sm font-semibold">
                    Assunto
                  </Label>
                  <Select
                    onValueChange={(value) => form.setValue("subject", value)}
                  >
                    <SelectTrigger className="bg-dark-surface border-glass-border focus:border-neon-green">
                      <SelectValue placeholder="Selecione o assunto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical">
                        Problema técnico
                      </SelectItem>
                      <SelectItem value="license">
                        Dúvida sobre licença
                      </SelectItem>

                      <SelectItem value="suggestion">Sugestão</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message" className="text-sm font-semibold">
                    Mensagem
                  </Label>
                  <Textarea
                    id="message"
                    rows={5}
                    placeholder="Descreva sua dúvida ou problema..."
                    className="bg-dark-surface border-glass-border focus:border-neon-green"
                    {...form.register("message")}
                  />
                  {form.formState.errors.message && (
                    <p className="text-sm text-red-500">{form.formState.errors.message.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full py-3 bg-neon-green text-black rounded-lg neon-glow font-bold hover:scale-105 transition-all duration-300"
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

          {/* FAQ */}
          <Card className="glass-effect border-glass-border">
            <CardHeader>
              <CardTitle className="flex items-center text-2xl font-orbitron">
                <HelpCircle className="text-neon-purple mr-3" />
                FAQ
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {faqItems.map((item, index) => (
                  <div key={index} className="faq-item">
                    <button
                      onClick={() => toggleFaq(index)}
                      className="w-full text-left py-3 px-4 bg-dark-surface rounded-lg hover:bg-glass-border transition-all duration-300 flex items-center justify-between"
                    >
                      <span className="font-medium">{item.question}</span>
                      {expandedFaq === index ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </button>
                    {expandedFaq === index && (
                      <div className="mt-2 p-4 bg-dark-surface rounded-lg text-sm text-gray-300 animate-slideIn">
                        {item.answer}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Contact Options */}
        <div className="grid md:grid-cols-2 gap-8">
          <Card className="glass-effect border-glass-border text-center hover:scale-105 transition-all duration-300">
            <CardContent className="p-6">
              <i className="fab fa-discord text-indigo-500 text-4xl mb-4"></i>
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

          <Card className="glass-effect border-glass-border text-center hover:scale-105 transition-all duration-300">
            <CardContent className="p-6">
              <Mail className="text-neon-green text-4xl mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Email</h3>
              <p className="text-gray-400 mb-4">contato@suportefovdark.shop</p>
              <Button 
                onClick={() => window.open('mailto:contato@suportefovdark.shop', '_blank')}
                className="bg-neon-green text-black hover:scale-105 transition-all duration-300"
              >
                Enviar Email
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Status Section */}
        <Card className="glass-effect border-glass-border mt-16">
          <CardHeader>
            <CardTitle className="text-2xl font-orbitron text-center">
              Status dos Serviços
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { service: "Servidor de Autenticação", status: "online" },
                { service: "Servidor de Downloads", status: "online" },
                { service: "Sistema Anti-Detecção", status: "online" },
                { service: "API de Licenças", status: "online" },
                { service: "Suporte ao Cliente", status: "online" },
              ].map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2"
                >
                  <span className="font-medium">{item.service}</span>
                  <div className="flex items-center">
                    <span className="w-3 h-3 bg-neon-green rounded-full mr-2 animate-pulse"></span>
                    <span className="text-neon-green font-semibold">
                      ONLINE
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
