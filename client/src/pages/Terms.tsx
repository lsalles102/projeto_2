import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Terms() {
  return (
    <div className="min-h-screen bg-dark-bg py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <CardTitle className="text-3xl font-bold neon-text text-center">
              Termos de Uso - FovDark
            </CardTitle>
          </CardHeader>
          <CardContent className="prose prose-invert max-w-none">
            <div className="space-y-6 text-gray-300">
              <section>
                <h2 className="text-xl font-bold text-primary mb-3">1. Aceitação dos Termos</h2>
                <p>
                  Ao acessar e usar o FovDark, você concorda em cumprir estes termos de uso e todas as leis e regulamentos aplicáveis.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-primary mb-3">2. Uso do Software</h2>
                <p>
                  O FovDark é fornecido exclusivamente para fins educacionais e de pesquisa. É responsabilidade do usuário garantir que o uso esteja em conformidade com as leis locais.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-primary mb-3">3. Licenças</h2>
                <p>
                  As licenças são pessoais e intransferíveis. Cada licença é válida para um único usuário e dispositivo. O compartilhamento de licenças é estritamente proibido.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-primary mb-3">4. Restrições</h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Não redistribuir, vender ou compartilhar o software</li>
                  <li>Não realizar engenharia reversa do código</li>
                  <li>Não usar para fins comerciais sem autorização</li>
                  <li>Não violar os termos de serviço de jogos ou plataformas</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-bold text-primary mb-3">5. Privacidade</h2>
                <p>
                  Respeitamos sua privacidade. Coletamos apenas informações necessárias para o funcionamento do serviço. Para mais detalhes, consulte nossa Política de Privacidade.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-primary mb-3">6. Isenção de Responsabilidade</h2>
                <p>
                  O software é fornecido "como está", sem garantias de qualquer tipo. Não nos responsabilizamos por danos decorrentes do uso do software.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-primary mb-3">7. Modificações</h2>
                <p>
                  Reservamos o direito de modificar estes termos a qualquer momento. As alterações entrarão em vigor imediatamente após a publicação.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-primary mb-3">8. Contato</h2>
                <p>
                  Para questões sobre estes termos, entre em contato conosco através do Discord ou email: contato@suportefovdark.shop
                </p>
              </section>

              <div className="text-center text-sm text-gray-500 mt-8">
                <p>Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}