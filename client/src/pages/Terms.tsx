import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Shield, AlertTriangle, Scale, FileText } from "lucide-react";

export default function Terms() {
  return (
    <div className="py-20">
      <div className="container mx-auto px-6 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-orbitron font-bold text-glow mb-4">TERMOS DE USO</h1>
          <p className="text-xl text-gray-300">Última atualização: Janeiro de 2024</p>
        </div>

        <Card className="glass-effect border-glass-border">
          <CardHeader>
            <CardTitle className="flex items-center text-2xl font-orbitron">
              <Scale className="text-neon-green mr-3" />
              Acordo de Termos de Serviço
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Introduction */}
            <div>
              <p className="text-gray-300 leading-relaxed">
                Ao acessar e usar os serviços da FovDark, você concorda em cumprir e estar vinculado aos seguintes termos e condições de uso. Se você não concordar com qualquer parte destes termos, não deverá usar nossos serviços.
              </p>
            </div>

            <Separator className="border-glass-border" />

            {/* Section 1 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4 flex items-center">
                <FileText className="mr-2" />
                1. Definições e Aceitação
              </h2>
              <div className="space-y-4 text-gray-300">
                <p>
                  <strong>1.1 Serviços:</strong> Refere-se ao software, aplicações, ferramentas e serviços fornecidos pela FovDark para uso em jogos eletrônicos.
                </p>
                <p>
                  <strong>1.2 Usuário:</strong> Qualquer pessoa que acesse, baixe ou use nossos serviços.
                </p>
                <p>
                  <strong>1.3 Licença:</strong> Autorização temporária para uso dos nossos serviços mediante pagamento.
                </p>
                <p>
                  <strong>1.4 HWID:</strong> Identificador único de hardware usado para vincular licenças a dispositivos específicos.
                </p>
              </div>
            </div>

            {/* Section 2 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4 flex items-center">
                <Shield className="mr-2" />
                2. Uso Permitido e Restrições
              </h2>
              <div className="space-y-4 text-gray-300">
                <p>
                  <strong>2.1 Uso Pessoal:</strong> Nossos serviços são destinados exclusivamente para uso pessoal e não comercial.
                </p>
                <p>
                  <strong>2.2 Proibições:</strong> É estritamente proibido:
                </p>
                <ul className="list-disc list-inside ml-4 space-y-2">
                  <li>Revender, redistribuir ou compartilhar licenças</li>
                  <li>Fazer engenharia reversa do software</li>
                  <li>Usar o serviço para atividades ilegais</li>
                  <li>Contornar sistemas de proteção ou autenticação</li>
                  <li>Usar múltiplas contas para contornar restrições</li>
                </ul>
                <p>
                  <strong>2.3 Responsabilidade do Usuário:</strong> Você é responsável por manter suas credenciais seguras e por todas as atividades realizadas em sua conta.
                </p>
              </div>
            </div>

            {/* Section 3 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4">
                3. Licenças e Pagamentos
              </h2>
              <div className="space-y-4 text-gray-300">
                <p>
                  <strong>3.1 Tipos de Licença:</strong> Oferecemos diferentes tipos de licenças (Basic, Premium, VIP) com funcionalidades específicas.
                </p>
                <p>
                  <strong>3.2 Duração:</strong> As licenças são válidas pelo período especificado no momento da compra.
                </p>
                <p>
                  <strong>3.3 Renovação:</strong> Licenças expiradas devem ser renovadas para continuar o acesso aos serviços.
                </p>
                <p>
                  <strong>3.4 Reembolsos:</strong> Oferecemos reembolso total em até 7 dias após a compra, sujeito à análise.
                </p>
                <p>
                  <strong>3.5 HWID Lock:</strong> Cada licença é vinculada a um HWID específico por motivos de segurança.
                </p>
              </div>
            </div>

            {/* Section 4 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4 flex items-center">
                <AlertTriangle className="mr-2" />
                4. Isenção de Responsabilidade
              </h2>
              <div className="space-y-4 text-gray-300">
                <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-lg p-4">
                  <p className="font-semibold text-yellow-400 mb-2">
                    ⚠️ AVISO IMPORTANTE
                  </p>
                  <p>
                    O uso de nossos serviços pode violar os termos de serviço de jogos específicos. 
                    Você usa nossos serviços por sua própria conta e risco.
                  </p>
                </div>
                <p>
                  <strong>4.1 Detecção:</strong> Embora utilizemos tecnologia anti-detecção avançada, não podemos garantir 100% de proteção contra sistemas anti-cheat.
                </p>
                <p>
                  <strong>4.2 Consequências:</strong> Não nos responsabilizamos por banimentos, suspensões ou outras penalidades aplicadas por desenvolvedores de jogos.
                </p>
                <p>
                  <strong>4.3 Disponibilidade:</strong> Nossos serviços são fornecidos "como estão" e podem ter indisponibilidades temporárias.
                </p>
              </div>
            </div>

            {/* Section 5 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4">
                5. Modificações e Cancelamento
              </h2>
              <div className="space-y-4 text-gray-300">
                <p>
                  <strong>5.1 Alterações nos Termos:</strong> Reservamos o direito de modificar estes termos a qualquer momento, com notificação prévia.
                </p>
                <p>
                  <strong>5.2 Suspensão de Serviços:</strong> Podemos suspender ou cancelar contas que violem estes termos.
                </p>
                <p>
                  <strong>5.3 Cancelamento pelo Usuário:</strong> Você pode cancelar sua conta a qualquer momento através do painel de usuário.
                </p>
              </div>
            </div>

            {/* Section 6 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4">
                6. Propriedade Intelectual
              </h2>
              <div className="space-y-4 text-gray-300">
                <p>
                  <strong>6.1 Direitos Autorais:</strong> Todo o conteúdo, software e materiais são propriedade da FovDark ou de seus licenciadores.
                </p>
                <p>
                  <strong>6.2 Licença de Uso:</strong> Concedemos apenas uma licença limitada, não exclusiva e intransferível para uso pessoal.
                </p>
                <p>
                  <strong>6.3 Marca Registrada:</strong> "FovDark" e todos os logos relacionados são marcas registradas protegidas.
                </p>
              </div>
            </div>

            {/* Section 7 */}
            <div>
              <h2 className="text-2xl font-orbitron font-bold text-neon-green mb-4">
                7. Lei Aplicável e Jurisdição
              </h2>
              <div className="space-y-4 text-gray-300">
                <p>
                  <strong>7.1 Lei Brasileira:</strong> Estes termos são regidos pelas leis da República Federativa do Brasil.
                </p>
                <p>
                  <strong>7.2 Foro:</strong> Qualquer disputa será resolvida no foro da comarca onde está localizada nossa sede.
                </p>
                <p>
                  <strong>7.3 Mediação:</strong> Encorajamos a resolução amigável de conflitos através de mediação antes de processos judiciais.
                </p>
              </div>
            </div>

            {/* Contact */}
            <div className="bg-dark-surface rounded-lg p-6">
              <h3 className="text-xl font-orbitron font-bold mb-4">Contato para Questões Legais</h3>
              <p className="text-gray-300">
                Para questões relacionadas a estes termos, entre em contato conosco:
              </p>
              <ul className="mt-4 space-y-2 text-gray-300">
                <li><strong>Email:</strong> legal@fovdark.com</li>
                <li><strong>Suporte:</strong> support@fovdark.com</li>
                <li><strong>Endereço:</strong> Informações disponíveis mediante solicitação</li>
              </ul>
            </div>

            {/* Final Notice */}
            <div className="text-center">
              <p className="text-sm text-gray-400">
                Ao continuar usando nossos serviços após alterações nestes termos, 
                você concorda com as novas condições.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
