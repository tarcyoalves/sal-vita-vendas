import { useAuth } from "../_core/hooks/useAuth";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { BarChart2, FileText, Package } from "lucide-react";
import { Page, PageHeader, AccessDenied } from "../components/layout/Page";
import AdminBillingPanorama from "../components/faturamento/AdminBillingPanorama";
import BillingReport from "../components/faturamento/BillingReport";
import ProductManager from "../components/faturamento/ProductManager";
import SmbiRoboPanel from "../components/faturamento/SmbiRoboPanel";

const TAB_TRIGGER_CLASS =
  "gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900";

export default function Faturamento() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "manager")) {
    return <AccessDenied area="Faturamento" />;
  }

  return (
    <Page>
      <PageHeader
        title="Faturamento"
        description="Panorama de vendas, pedidos e comissões, e catálogo de produtos."
      />

      <SmbiRoboPanel />

      <Tabs defaultValue="panorama">
        <TabsList className="h-auto gap-1 rounded-md bg-slate-100 p-1">
          <TabsTrigger value="panorama" className={TAB_TRIGGER_CLASS}>
            <BarChart2 size={15} aria-hidden /> Panorama
          </TabsTrigger>
          <TabsTrigger value="relatorio" className={TAB_TRIGGER_CLASS}>
            <FileText size={15} aria-hidden /> Pedidos
          </TabsTrigger>
          <TabsTrigger value="produtos" className={TAB_TRIGGER_CLASS}>
            <Package size={15} aria-hidden /> Produtos
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
    </Page>
  );
}
