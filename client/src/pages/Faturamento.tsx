import { useAuth } from "../_core/hooks/useAuth";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { DollarSign, BarChart2, FileText, Package, Sparkles } from "lucide-react";
import AdminBillingPanorama from "../components/faturamento/AdminBillingPanorama";
import BillingReport from "../components/faturamento/BillingReport";
import ProductManager from "../components/faturamento/ProductManager";

const TAB_TRIGGER_CLASS =
  "gap-1.5 rounded-xl px-3 py-2 text-slate-500 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=active]:shadow-md";

export default function Faturamento() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "manager")) {
    return <div className="p-4">Acesso negado</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[#081F47] px-6 py-6 text-white shadow-md border border-slate-800">
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-blue-500/10 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <DollarSign size={24} className="text-blue-200" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Faturamento & Comissões</h1>
              <Sparkles size={16} className="text-amber-400 hidden sm:block" />
            </div>
            <p className="text-xs md:text-sm text-blue-200/80 mt-0.5">
              Panorama de vendas, relatório detalhado de pedidos e catálogo de produtos
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="panorama">
        <TabsList className="inline-flex gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200/60">
          <TabsTrigger
            value="panorama"
            className="gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 data-[state=active]:bg-[#0C3680] data-[state=active]:text-white data-[state=active]:shadow-xs transition-all"
          >
            <BarChart2 size={15} /> Panorama
          </TabsTrigger>
          <TabsTrigger
            value="relatorio"
            className="gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 data-[state=active]:bg-[#0C3680] data-[state=active]:text-white data-[state=active]:shadow-xs transition-all"
          >
            <FileText size={15} /> Pedidos
          </TabsTrigger>
          <TabsTrigger
            value="produtos"
            className="gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 data-[state=active]:bg-[#0C3680] data-[state=active]:text-white data-[state=active]:shadow-xs transition-all"
          >
            <Package size={15} /> Produtos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="panorama" className="mt-4">
          <AdminBillingPanorama />
        </TabsContent>
        <TabsContent value="relatorio" className="mt-4">
          <BillingReport />
        </TabsContent>
        <TabsContent value="produtos" className="mt-4">
          <ProductManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
