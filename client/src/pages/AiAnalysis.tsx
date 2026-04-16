import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AiAnalysis() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // The AI analysis features are now integrated into the Admin Dashboard
    setLocation("/admin/dashboard");
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Redirecionando para o Dashboard...</p>
    </div>
  );
}
