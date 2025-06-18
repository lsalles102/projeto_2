import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Crosshair,
  Eye,
  Shield,
  Users,
  Clock,
  TrendingUp,
} from "lucide-react";

export default function Home() {
  const [stats, setStats] = useState({
    users: 0,
    detection: 0,
    support: 0,
    updates: 0,
  });

  useEffect(() => {
    // Animate counters
    const animateCounter = (
      target: number,
      setter: (value: number) => void,
    ) => {
      const increment = target / 50;
      let current = 0;
      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          setter(target);
          clearInterval(timer);
        } else {
          setter(Math.floor(current));
        }
      }, 50);
    };

    const timer = setTimeout(() => {
      animateCounter(865, (value) =>
        setStats((prev) => ({ ...prev, users: value })),
      );
      animateCounter(89, (value) =>
        setStats((prev) => ({ ...prev, detection: value })),
      );
      animateCounter(1, (value) =>
        setStats((prev) => ({ ...prev, support: value })),
      );
      animateCounter(8, (value) =>
        setStats((prev) => ({ ...prev, updates: value })),
      );
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div>
      {/* Hero Section */}
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden hero-bg">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-dark-bg"></div>

        <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
          <div className="animate-slideIn">
            <h1 className="text-5xl md:text-7xl font-orbitron font-black mb-6 ">
              CHEATS <span className="text-primary">BLOODSTRIKE</span>{" "}
              PREMIUM
            </h1>
            <h2 className="text-xl md:text-2xl mb-8 text-gray-300 font-rajdhani">
              Aimbot indetectável. Domine todas as partidas com precisão
              perfeita.
            </h2>
            <div className="flex justify-center mb-8">
              <Link href="/pricing">
                <Button className="px-8 py-4 bg-primary text-black rounded-lg neon-glow font-bold text-lg hover:scale-105 transition-all duration-300">
                  <i className="fas fa-shopping-cart mr-2"></i>COMPRAR AGORA
                </Button>
              </Link>
            </div>

            {/* Video Demo Card */}
            <div className="mt-12 max-w-4xl mx-auto">
              <Card className="bg-card/50 backdrop-blur-sm border-primary/20 overflow-hidden">
                <CardContent className="p-6">
                  <h3 className="text-2xl font-orbitron font-bold text-center mb-6 text-primary">
                    🎮 DEMONSTRAÇÃO DO CHEAT EM AÇÃO
                  </h3>
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-black/50">
                    <iframe
                      src="https://www.canva.com/design/DAGqoRxxcRk/lIm_TyWZsFLglfT7kJE9-w/watch?embed"
                      className="w-full h-full"
                      frameBorder="0"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                      title="FovDark Cheat Demo"
                    ></iframe>
                  </div>
                  <p className="text-center text-gray-300 mt-4 text-sm">
                    Veja o FovDark em ação no BloodStrike com aimbot preciso e recursos avançados
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Floating Elements */}
        <div className="absolute top-1/4 left-10 animate-float opacity-60">
          <Crosshair className="text-primary text-3xl" />
        </div>
        <div
          className="absolute top-1/3 right-20 animate-float opacity-60"
          style={{ animationDelay: "1s" }}
        >
          <Shield className="text-accent text-2xl" />
        </div>
        <div
          className="absolute bottom-1/4 left-1/4 animate-float opacity-60"
          style={{ animationDelay: "2s" }}
        >
          <i className="fas fa-skull text-yellow-400 text-xl"></i>
        </div>
      </div>

      {/* Features Section */}
      <section className="py-20 bg-gradient-gaming">
        <div className="container mx-auto px-6">
          <h2 className="text-4xl font-orbitron font-bold text-center mb-16 ">
            RECURSOS AVANÇADOS BLOODSTRIKE
          </h2>
          <p className="text-center text-gray-300 mb-12 text-lg max-w-3xl mx-auto">
            Sistema de cheats para BloodStrike com tecnologia anti-detecção
            avançada. Desenvolvido especialmente para jogadores brasileiros que
            buscam dominar o jogo.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 hover:bg-glass-border transition-all duration-300 group">
              <CardContent className="p-8 text-center">
                <Crosshair className="text-primary text-4xl mx-auto mb-4 group-hover:scale-110 transition-transform duration-300" />
                <h3 className="text-xl font-bold mb-4">AIMBOT INDETECTÁVEL</h3>
                <p className="text-gray-300">
                  Mira automática através da cor para BloodStrike com smooth
                  aim, FOV configurável e de anti-cheat garantido.
                </p>
              </CardContent>
            </Card>

            {/* Feature 2 */}
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 hover:bg-glass-border transition-all duration-300 group opacity-60">
              <CardContent className="p-8 text-center">
                <Eye className="text-gray-500 text-4xl mx-auto mb-4 group-hover:scale-110 transition-transform duration-300" />
                <h3 className="text-xl font-bold mb-4 text-gray-500">
                  ESP & WALLHACK
                </h3>
                <p className="text-gray-500">
                  Em desenvolvimento - Disponível em breve
                </p>
                <div className="mt-2">
                  <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                    EM MANUTENÇÃO
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Feature 3 */}
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 hover:bg-glass-border transition-all duration-300 group">
              <CardContent className="p-8 text-center">
                <Shield className="text-yellow-400 text-4xl mx-auto mb-4 group-hover:scale-110 transition-transform duration-300" />
                <h3 className="text-xl font-bold mb-4">ANTI-DETECÇÃO</h3>
                <p className="text-gray-300">
                  Sistema anti-cheat com atualizações em tempo real para
                  garantir 100% de segurança no BloodStrike.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-muted">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-orbitron font-bold text-primary mb-2">
                {stats.users.toLocaleString()}
              </div>
              <p className="text-gray-400">Usuários Ativos</p>
            </div>
            <div>
              <div className="text-4xl font-orbitron font-bold text-primary mb-2">
                {stats.detection}%
              </div>
              <p className="text-gray-400">Indetectável</p>
            </div>
            <div>
              <div className="text-4xl font-orbitron font-bold text-primary mb-2">
                {stats.support}/2
              </div>
              <p className="text-gray-400">Suporte 1/2</p>
            </div>
            <div>
              <div className="text-4xl font-orbitron font-bold text-primary mb-2">
                {stats.updates}+
              </div>
              <p className="text-gray-400">Updates/Mês</p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-20 bg-gradient-gaming">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl font-orbitron font-bold mb-8 ">
            PRONTO PARA DOMINAR?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Junte-se a milhares de jogadores que já escolheram FovDark para
            levar seu jogo ao próximo nível.
          </p>
          <Link href="/pricing">
            <Button className="px-8 py-4 bg-primary text-black rounded-lg neon-glow font-bold text-lg hover:scale-105 transition-all duration-300">
              COMEÇAR AGORA
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
