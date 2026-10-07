import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AiAnalysis() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // The AI analysis features are now integrated into the Admin Dashboard
    setLocation("/admin/dashboard");
  }, [setLocation]);

  return (
    <div className="flex h-64 items-center justify-center">
      <p className="text-sm text-slate-500">Redirecionando para o Dashboard...</p>
    </div>
  );
}
