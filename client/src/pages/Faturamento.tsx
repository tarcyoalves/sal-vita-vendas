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
  const { user } = useAuth();

  if (!user || (user.role !== "admin" && user.role !== "manager")) {
    return <div className="p-4">Acesso negado</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 px-5 py-5 md:px-7 md:py-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/4 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative flex items-center gap-3 md:gap-4">
          <div className="flex h-11 w-11 md:h-14 md:w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <DollarSign size={26} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-2xl font-bold tracking-tight">Faturamento & Comissao</h1>
              <Sparkles size={16} className="text-sky-300 hidden sm:block" />
            </div>
            <p className="text-xs md:text-sm text-blue-200/80 mt-0.5">
              Panorama de vendas, relatorio detalhado e catalogo de produtos
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="panorama">
        <TabsList className="flex-nowrap overflow-x-auto scrollbar-hide justify-start gap-1 rounded-2xl bg-slate-100 p-1.5">
          <TabsTrigger value="panorama" className={`${TAB_TRIGGER_CLASS} flex-shrink-0`}>
            <BarChart2 size={14} /> Panorama
          </TabsTrigger>
          <TabsTrigger value="relatorio" className={`${TAB_TRIGGER_CLASS} flex-shrink-0`}>
            <FileText size={14} /> Pedidos
          </TabsTrigger>
          <TabsTrigger value="produtos" className={`${TAB_TRIGGER_CLASS} flex-shrink-0`}>
            <Package size={14} /> Produtos
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
