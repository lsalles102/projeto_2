import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Shield, Eye, Lock, Database, Settings, Cookie } from "lucide-react";

export default function Privacy() {
  return (
    <div className="py-20">
      <div className="container mx-auto px-6 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-orbitron font-bold text-glow mb-4">POLÍTICA DE PRIVACIDADE</h1>
          <p className="text-xl text-gray-300">Última atualização: Janeiro de 2024</p>
        </div>

        <Card className="glass-effect border-glass-border">
          <CardHeader>
            <CardTitle className="flex items-center text-2xl font-orbitron">
              <Shield className="text-neon-green mr-3" />
              Proteção de Dados e Privacidade
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Introduction */}
            <div>
              <p className="text-gray-300 leading-relaxed">
                A FovDark está comprometida em proteger sua privacidade e dados pessoais. Esta política explica como coletamos, usamos, armazenamos e protegemos suas informações quando você utiliza nossos serviços.
              </p>
            </div>

            <Separator className="border-glass-border" />

            {/* Section 1 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4 flex items-center">
                <Database className="mr-2" />
                1. Informações que Coletamos
              </h2>
              <div className="space-y-4 text-gray-300">
                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">1.1 Dados de Conta</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Nome completo e endereço de email</li>
                    <li>Senha criptografada (nunca armazenamos senhas em texto simples)</li>
                    <li>Data de criação da conta e último acesso</li>
                    <li>Informações de perfil do Google (quando usar OAuth)</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">1.2 Dados de Licença</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>HWID (Hardware ID) do seu dispositivo</li>
                    <li>Chaves de ativação e status da licença</li>
                    <li>Histórico de downloads e ativações</li>
                    <li>Tipo de plano e data de expiração</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">1.3 Dados Técnicos</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Endereço IP e informações de localização</li>
                    <li>Tipo de navegador e sistema operacional</li>
                    <li>Logs de acesso e atividade no sistema</li>
                    <li>Informações de desempenho e diagnóstico</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Section 2 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4 flex items-center">
                <Eye className="mr-2" />
                2. Como Usamos suas Informações
              </h2>
              <div className="space-y-4 text-gray-300">
                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">2.1 Prestação de Serviços</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Autenticação e gerenciamento de contas</li>
                    <li>Validação e ativação de licenças</li>
                    <li>Fornecimento de downloads autorizados</li>
                    <li>Suporte técnico e atendimento ao cliente</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">2.2 Segurança e Proteção</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Prevenção de uso não autorizado</li>
                    <li>Detecção de atividades fraudulentas</li>
                    <li>Proteção contra violações de segurança</li>
                    <li>Vinculação de licenças a dispositivos específicos</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">2.3 Melhorias e Comunicação</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Análise de uso para melhorar nossos serviços</li>
                    <li>Comunicação sobre atualizações importantes</li>
                    <li>Notificações sobre status da licença</li>
                    <li>Ofertas e promoções (com seu consentimento)</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Section 3 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4 flex items-center">
                <Lock className="mr-2" />
                3. Proteção e Armazenamento de Dados
              </h2>
              <div className="space-y-4 text-gray-300">
                <div className="bg-green-500/20 border border-green-500/40 rounded-lg p-4">
                  <p className="font-semibold text-green-400 mb-2">
                    🔒 SEGURANÇA AVANÇADA
                  </p>
                  <p>
                    Utilizamos criptografia de nível bancário e práticas de segurança líderes 
                    da indústria para proteger seus dados.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">3.1 Medidas de Segurança</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Criptografia SSL/TLS para transmissão de dados</li>
                    <li>Hashing seguro de senhas com bcrypt</li>
                    <li>Autenticação de dois fatores disponível</li>
                    <li>Monitoramento 24/7 de segurança</li>
                    <li>Auditorias regulares de segurança</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">3.2 Armazenamento</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Dados armazenados em servidores seguros e criptografados</li>
                    <li>Backups regulares com criptografia</li>
                    <li>Retenção de dados apenas pelo tempo necessário</li>
                    <li>Conformidade com padrões internacionais de segurança</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Section 4 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4 flex items-center">
                <Settings className="mr-2" />
                4. Seus Direitos e Controles
              </h2>
              <div className="space-y-4 text-gray-300">
                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">4.1 Direitos LGPD</h3>
                  <p>De acordo com a Lei Geral de Proteção de Dados, você tem direito a:</p>
                  <ul className="list-disc list-inside ml-4 space-y-1 mt-2">
                    <li>Confirmar a existência de tratamento de dados</li>
                    <li>Acessar seus dados pessoais</li>
                    <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
                    <li>Solicitar anonimização, bloqueio ou eliminação</li>
                    <li>Solicitar portabilidade dos dados</li>
                    <li>Obter informações sobre compartilhamento</li>
                    <li>Revogar consentimento</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">4.2 Como Exercer seus Direitos</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Acesse configurações da conta no painel de usuário</li>
                    <li>Entre em contato com nosso DPO: privacy@fovdark.com</li>
                    <li>Solicite exclusão da conta através do suporte</li>
                    <li>Configure preferências de comunicação</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Section 5 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4 flex items-center">
                <Cookie className="mr-2" />
                5. Cookies e Tecnologias Similares
              </h2>
              <div className="space-y-4 text-gray-300">
                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">5.1 Tipos de Cookies</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li><strong>Essenciais:</strong> Necessários para funcionamento básico</li>
                    <li><strong>Sessão:</strong> Mantém você logado durante a visita</li>
                    <li><strong>Preferências:</strong> Lembra suas configurações</li>
                    <li><strong>Analíticos:</strong> Nos ajuda a melhorar o serviço</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">5.2 Controle de Cookies</h3>
                  <p>
                    Você pode gerenciar cookies através das configurações do seu navegador. 
                    Note que desabilitar cookies essenciais pode afetar a funcionalidade do site.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 6 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4">
                6. Compartilhamento de Dados
              </h2>
              <div className="space-y-4 text-gray-300">
                <div className="bg-blue-500/20 border border-blue-500/40 rounded-lg p-4">
                  <p className="font-semibold text-blue-400 mb-2">
                    ℹ️ TRANSPARÊNCIA TOTAL
                  </p>
                  <p>
                    Não vendemos, alugamos ou comercializamos seus dados pessoais com terceiros.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">6.1 Compartilhamento Limitado</h3>
                  <p>Compartilhamos dados apenas quando:</p>
                  <ul className="list-disc list-inside ml-4 space-y-1 mt-2">
                    <li>Necessário para prestação do serviço</li>
                    <li>Exigido por lei ou ordem judicial</li>
                    <li>Para proteger direitos e segurança</li>
                    <li>Com provedores de serviço sob contrato de confidencialidade</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">6.2 Processadores de Dados</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Provedores de hospedagem com certificação de segurança</li>
                    <li>Processadores de pagamento conformes com PCI DSS</li>
                    <li>Serviços de email transacional</li>
                    <li>Ferramentas de análise e monitoramento</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Section 7 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4">
                7. Retenção e Exclusão de Dados
              </h2>
              <div className="space-y-4 text-gray-300">
                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">7.1 Períodos de Retenção</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li><strong>Dados de conta:</strong> Até exclusão solicitada pelo usuário</li>
                    <li><strong>Dados de licença:</strong> 2 anos após expiração</li>
                    <li><strong>Logs de acesso:</strong> 90 dias</li>
                    <li><strong>Dados de suporte:</strong> 3 anos após último contato</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-neon-yellow mb-2">7.2 Exclusão Automática</h3>
                  <p>
                    Dados são automaticamente excluídos após os períodos estabelecidos, 
                    exceto quando retenção é exigida por lei.
                  </p>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-dark-surface rounded-lg p-6">
              <h3 className="text-xl font-orbitron font-bold mb-4">Contato para Questões de Privacidade</h3>
              <div className="space-y-3 text-gray-300">
                <p><strong>Encarregado de Proteção de Dados (DPO):</strong></p>
                <ul className="space-y-2">
                  <li><strong>Email:</strong> privacy@fovdark.com</li>
                  <li><strong>Suporte:</strong> support@fovdark.com</li>
                  <li><strong>Tempo de resposta:</strong> Até 72 horas</li>
                </ul>
              </div>
            </div>

            {/* Updates Notice */}
            <div className="text-center">
              <p className="text-sm text-gray-400">
                Esta política pode ser atualizada periodicamente. Notificaremos sobre 
                alterações significativas através do email cadastrado ou avisos no site.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
