import { Link } from "wouter";
import { Crosshair } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-dark-surface border-t border-glass-border py-12">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <Crosshair className="text-neon-green text-2xl" />
              <h3 className="text-xl font-orbitron font-bold">FovDark</h3>
            </div>
            <p className="text-gray-400 text-sm">
              Líder em cheats para BloodStrike com tecnologia anti-detecção avançada.
            </p>
          </div>
          
          <div>
            <h4 className="font-bold mb-4">Produto</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/pricing" className="hover:text-neon-green transition-colors duration-300">Preços</Link></li>
              <li><Link href="/dashboard" className="hover:text-neon-green transition-colors duration-300">Download</Link></li>
              <li><a href="#" className="hover:text-neon-green transition-colors duration-300">Atualizações</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold mb-4">Suporte</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/support" className="hover:text-neon-green transition-colors duration-300">Central de Ajuda</Link></li>
              <li><a href="#" className="hover:text-neon-green transition-colors duration-300">Discord</a></li>
              <li><a href="#" className="hover:text-neon-green transition-colors duration-300">Status do Servidor</a></li>
              <li><Link href="/support" className="hover:text-neon-green transition-colors duration-300">Contato</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/terms" className="hover:text-neon-green transition-colors duration-300">Termos de Uso</Link></li>
              <li><Link href="/privacy" className="hover:text-neon-green transition-colors duration-300">Política de Privacidade</Link></li>
              <li><a href="#" className="hover:text-neon-green transition-colors duration-300">Reembolsos</a></li>
              <li><a href="#" className="hover:text-neon-green transition-colors duration-300">DMCA</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-glass-border mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            © 2024 FovDark. Todos os direitos reservados.
          </p>
          <div className="flex space-x-4 mt-4 md:mt-0">
            <a href="#" className="text-gray-400 hover:text-neon-green transition-colors duration-300">
              <i className="fab fa-discord text-xl"></i>
            </a>
            <a href="#" className="text-gray-400 hover:text-neon-green transition-colors duration-300">
              <i className="fab fa-youtube text-xl"></i>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
