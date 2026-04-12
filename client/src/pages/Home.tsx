import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      if (user.role === "admin") {
        setLocation("/admin/dashboard");
      } else {
        setLocation("/vendor/reminders");
      }
    }
  }, [loading, isAuthenticated, user, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-700">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-700 p-4">
        <div className="text-center max-w-md">
          <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663471406798/ebiDeAqNiPYHcVdFoPsqfV/sal_vita_logo_d22b1eb4.webp" alt="Sal Vita" className="h-24 mx-auto mb-4" />
          <p className="text-blue-100 mb-8">Sistema de Gestão de Vendas e Performance</p>
          
          <div className="space-y-4">
            <a href={getLoginUrl()}>
              <Button className="w-full bg-white text-blue-900 hover:bg-blue-50">
                Fazer Login
              </Button>
            </a>
          </div>

          <p className="text-blue-200 text-sm mt-8">
            Bem-vindo ao Sal Vita!<br/>
            Gerencie suas ligações e acompanhe o desempenho da sua equipe
          </p>
        </div>
      </div>
    );
  }

  return null;
}
