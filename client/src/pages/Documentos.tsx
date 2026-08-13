import { useState, useEffect } from "react";
import { 
  FileText, 
  Download, 
  Share2, 
  Search, 
  Building2, 
  Package, 
  ShieldCheck, 
  Copy, 
  Check, 
  ExternalLink,
  Eye,
  Sparkles,
  Info,
  Layers,
  Factory,
  Truck,
  ShoppingCart,
  Award,
  Plus,
  Trash2,
  Lock,
  UploadCloud,
  FilePlus,
  X
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "../_core/hooks/useAuth";

interface TechnicalProduct {
  id: string;
  name: string;
  subTitle?: string;
  category: "bigbag" | "sacaria" | "varejo";
  categoryLabel: string;
  packageType: string;
  brands: string[];
  iodineOptions: string;
  applications: string[];
  targetAudience: string[];
  description: string;
  specs: {
    weight: string;
    granulometry: string;
    solubility: string;
    purity: string;
    storage: string;
  };
  badgeColor: string;
  iconType: "bigbag" | "sacaria" | "varejo";
  fileUrl?: string;
  isCustom?: boolean;
}

interface CompanyDocument {
  id: string;
  title: string;
  description: string;
  category: "cadastral" | "licenca" | "fiscal" | "bancario";
  categoryLabel: string;
  fileType: string;
  fileSize: string;
  lastUpdated: string;
  details?: string[];
  copyContent?: string;
  fileUrl?: string;
  isCustom?: boolean;
}

const DEFAULT_PRODUCTS: TechnicalProduct[] = [
  {
    id: "sal-refinado-bigbag",
    name: "Sal Refinado COM E SEM IOD",
    subTitle: "Big Bag 1.000 KG",
    category: "bigbag",
    categoryLabel: "Big Bag (1.000 kg)",
    packageType: "Big Bag de 1.000 KG",
    brands: ["SAL VITA"],
    iodineOptions: "Disponível COM e SEM adição de Iodo",
    applications: [
      "Fábricas de rações animais",
      "Indústrias de alimentos e conservas",
      "Indústrias químicas e processos industriais"
    ],
    targetAudience: [
      "Fábricas de Rações",
      "Indústria Alimentícia",
      "Indústria Química"
    ],
    description: "Sal refinado de altíssima pureza com granulometria fina uniforme. Processo de secagem e refino avançado garantindo excelente solubilidade e homogeneidade para misturas industriais pesadas.",
    specs: {
      weight: "1.000 KG (Big Bag em Polipropileno)",
      granulometry: "Fina e Homogênea (Refinado)",
      solubility: "Rápida e Completa",
      purity: "NaCl ≥ 99,0%",
      storage: "Local seco, arejado e sobre estrados"
    },
    badgeColor: "bg-blue-600 text-white",
    iconType: "bigbag"
  },
  {
    id: "sal-granulado-bigbag",
    name: "Sal Granulado COM E SEM IOD",
    subTitle: "Big Bag 1.000 KG",
    category: "bigbag",
    categoryLabel: "Big Bag (1.000 kg)",
    packageType: "Big Bag de 1.000 KG",
    brands: ["SAL VITA"],
    iodineOptions: "Disponível COM e SEM adição de Iodo",
    applications: [
      "Produção de sal mineral e suplementos para gado",
      "Fábricas de rações e nutrição animal",
      "Fazendas e agropecuárias de grande porte"
    ],
    targetAudience: [
      "Fábricas de Ração",
      "Fazendas de Pecuária",
      "Produtores de Sal Mineral"
    ],
    description: "Perfeito para misturas minerais e nutrição de gado bovino, caprino e equino. Possui grãos selecionados que evitam o empedramento precoce e proporcionam liberação equilibrada dos minerais.",
    specs: {
      weight: "1.000 KG (Big Bag em Polipropileno)",
      granulometry: "Granulado Misto / Médio",
      solubility: "Gradativa / Controlada",
      purity: "NaCl ≥ 98,5%",
      storage: "Local coberto, fresco e protegido da umidade"
    },
    badgeColor: "bg-emerald-600 text-white",
    iconType: "bigbag"
  },
  {
    id: "sal-moido-grosso-bigbag",
    name: "Sal Moído, Triturado e Grosso",
    subTitle: "Big Bag 1.000 KG",
    category: "bigbag",
    categoryLabel: "Big Bag (1.000 kg)",
    packageType: "Big Bag de 1.000 KG",
    brands: ["SAL VITA"],
    iodineOptions: "Industrial / Agro (Consulte especificação)",
    applications: [
      "Fábricas de rações e nutrição animal",
      "Fazendas e grandes produtores rurais",
      "Empresas de saneamento básico e tratamento de água"
    ],
    targetAudience: [
      "Fábricas de Ração",
      "Fazendas Agropecuárias",
      "Saneamento Básico"
    ],
    description: "Linha versátil de sal em grande volume para aplicações agropastoris e tratamento de água. Oferecido em diferentes moagens (Moído, Triturado ou Grosso) conforme a necessidade do processo produtivo.",
    specs: {
      weight: "1.000 KG (Big Bag de alta resistência)",
      granulometry: "Moído, Triturado ou Grosso",
      solubility: "Conforme a moagem escolhida",
      purity: "NaCl ≥ 98,0%",
      storage: "Manter afastado do solo e paredes"
    },
    badgeColor: "bg-amber-600 text-white",
    iconType: "bigbag"
  },
  {
    id: "sal-fazendeiro-25kg",
    name: "Sal do Fazendeiro Moído 25 KG",
    subTitle: "Linha Agro 25 KG",
    category: "sacaria",
    categoryLabel: "Sacaria (25 kg)",
    packageType: "Saco de 25 KG",
    brands: ["SAL DO FAZENDEIRO", "SAL VITA"],
    iodineOptions: "Formulação Agropecuária Especial",
    applications: [
      "Fábricas de rações e fazendas",
      "Empresas de saneamento básico",
      "Curtumes e charqueadas",
      "Lojas agropecuárias e pet shops voltados para linha agro"
    ],
    targetAudience: [
      "Lojas Agropecuárias & Pet Shops",
      "Fazendas & Criadores",
      "Curtumes & Charqueadas"
    ],
    description: "Marca tradicional consolidada no mercado agro. Embalagem reforçada de 25 kg ideal para manuseio direto no campo, cochos de gado, curtimento de couros e misturas para ração animal.",
    specs: {
      weight: "25 KG (Saco de Polietileno Reforçado)",
      granulometry: "Moído / Fino Agro",
      solubility: "Boa dissolução em misturas",
      purity: "NaCl ≥ 98,0%",
      storage: "Empilhamento máximo recomendado: 15 sacos"
    },
    badgeColor: "bg-orange-600 text-white",
    iconType: "sacaria"
  },
  {
    id: "sal-refinado-25kg",
    name: "Sal Refinado COM E SEM IOD 25 KG",
    subTitle: "Sacaria Industrial 25 KG",
    category: "sacaria",
    categoryLabel: "Sacaria (25 kg)",
    packageType: "Saco de 25 KG",
    brands: ["SAL VITA"],
    iodineOptions: "Disponível COM e SEM adição de Iodo",
    applications: [
      "Laticínios e derivados de leite",
      "Fábricas de alimentos e panificação",
      "Fábricas de ração e nutrição",
      "Frigoríficos e indústrias químicas"
    ],
    targetAudience: [
      "Laticínios & Queijarias",
      "Frigoríficos",
      "Indústria Alimentícia"
    ],
    description: "Sal refinado de alta pureza em sacos de 25 kg para fácil fracionamento no ambiente industrial. Excelente fluidez, alta solubilidade e controle de dosagem preciso em laticínios e embutidos.",
    specs: {
      weight: "25 KG",
      granulometry: "Fina e Uniforme (Refinado)",
      solubility: "Alta e Rápida",
      purity: "NaCl ≥ 99,0%",
      storage: "Local seco e limpo"
    },
    badgeColor: "bg-indigo-600 text-white",
    iconType: "sacaria"
  },
  {
    id: "sal-granulado-25kg",
    name: "Sal Granulado COM E SEM IODO 25 KG",
    subTitle: "Sacaria Industrial 25 KG",
    category: "sacaria",
    categoryLabel: "Sacaria (25 kg)",
    packageType: "Saco de 25 KG",
    brands: ["SAL VITA"],
    iodineOptions: "Disponível COM e SEM adição de Iodo",
    applications: [
      "Laticínios e salga de queijos",
      "Fábricas de alimentos e frigoríficos",
      "Fábricas de ração e nutrição animal",
      "Processos industriais que exigem sal granulado"
    ],
    targetAudience: [
      "Laticínios",
      "Frigoríficos",
      "Nutrição Animal"
    ],
    description: "Desenvolvido para processos produtivos que requerem maior granulometria e liberação mais lenta do sal no processo fabril ou na nutrição animal, reduzindo perdas e garantindo eficiência.",
    specs: {
      weight: "25 KG",
      granulometry: "Granulado Médio",
      solubility: "Liberação Gradativa",
      purity: "NaCl ≥ 98,5%",
      storage: "Manter sobre estrados secos"
    },
    badgeColor: "bg-teal-600 text-white",
    iconType: "sacaria"
  },
  {
    id: "sal-vita-30x1",
    name: "Sal Refinado VITA 30×1 KG",
    subTitle: "Fardo Varejo 30 KG",
    category: "varejo",
    categoryLabel: "Linha Varejo (1 kg)",
    packageType: "Fardo com 30 pacotes de 1 KG",
    brands: ["SAL VITA"],
    iodineOptions: "Iodado (Conforme Legislação Sanitária Nacional)",
    applications: [
      "Supermercados e hipermercados",
      "Mercearias e comércios de bairro",
      "Atacarejos e distribuidoras de alimentos",
      "Restaurantes e consumo doméstico"
    ],
    targetAudience: [
      "Supermercados & Atacarejos",
      "Distribuidoras de Alimentos",
      "Mercearias"
    ],
    description: "O Sal Refinado VITA em embalagens de 1 kg é referência em qualidade nas prateleiras dos supermercados. Sal extra branco, soltinho e iodado conforme exigências do Ministério da Saúde.",
    specs: {
      weight: "Fardo de 30 KG (30 pacotes de 1 KG)",
      granulometry: "Extra Fino e Soltinho",
      solubility: "Instantânea",
      purity: "NaCl ≥ 99,1% + Iodo Potássico",
      storage: "Empilhamento máx: 10 fardos"
    },
    badgeColor: "bg-cyan-600 text-white",
    iconType: "varejo"
  },
  {
    id: "sal-vita-10x1",
    name: "Sal Refinado VITA 10×1 KG",
    subTitle: "Fardo Varejo 10 KG",
    category: "varejo",
    categoryLabel: "Linha Varejo (1 kg)",
    packageType: "Fardo com 10 pacotes de 1 KG",
    brands: ["SAL VITA"],
    iodineOptions: "Iodado (Conforme Legislação Sanitária Nacional)",
    applications: [
      "Distribuidoras de alimentos de pequeno e médio porte",
      "Minimercados e mercearias",
      "Lojas de conveniência",
      "Atacado e varejo de menor porte para rápida reposição"
    ],
    targetAudience: [
      "Minimercados & Conveniências",
      "Pequenas Distribuidoras",
      "Mercearias de Bairro"
    ],
    description: "Versão otimizada de fardo compacto com 10 pacotes de 1 kg. Excelente para estabelecimentos de menor porte que necessitam de menor investimento por fardo e alta rotatividade de estoque.",
    specs: {
      weight: "Fardo de 10 KG (10 pacotes de 1 KG)",
      granulometry: "Extra Fino e Soltinho",
      solubility: "Instantânea",
      purity: "NaCl ≥ 99,1% + Iodo Potássico",
      storage: "Local seco e limpo"
    },
    badgeColor: "bg-purple-600 text-white",
    iconType: "varejo"
  }
];

const DEFAULT_COMPANY_DOCS: CompanyDocument[] = [
  {
    id: "doc-cnpj",
    title: "Ficha Cadastral da Empresa (CNPJ)",
    description: "Comprovante de Inscrição e de Situação Cadastral na Receita Federal do Brasil.",
    category: "cadastral",
    categoryLabel: "Cadastro & Identificação",
    fileType: "PDF",
    fileSize: "240 KB",
    lastUpdated: "Atualizado em 2026",
    details: [
      "Razão Social: T A CONSULTORIA EMPRESARIAL LTDA / SAL VITA",
      "CNPJ: Regular na Receita Federal",
      "Atividade Principal: Moagem, refino e comércio atacadista de sal",
      "Inscrição Estadual: Ativa"
    ],
    copyContent: "DADOS CADASTRAIS SAL VITA:\nRazão Social: T A CONSULTORIA EMPRESARIAL LTDA\nCNPJ: Inscrição Ativa\nAtividade: Fabricação e Comércio Atacadista de Sal"
  },
  {
    id: "doc-alvara",
    title: "Alvará de Funcionamento e Localização",
    description: "Alvará municipal concedido para operação da fábrica e centro de distribuição de sal.",
    category: "licenca",
    categoryLabel: "Licenças & Alvarás",
    fileType: "PDF",
    fileSize: "512 KB",
    lastUpdated: "Válido até 2027",
    details: [
      "Órgão Emissor: Prefeitura Municipal",
      "Atividade: Industrialização e Envasamento de Sal",
      "Situação: Deferido e Válido"
    ]
  },
  {
    id: "doc-sanitaria",
    title: "Licença Sanitária / ANVISA",
    description: "Certificado de Vigilância Sanitária autorizando a produção e embalagem de sal alimentício.",
    category: "licenca",
    categoryLabel: "Licenças & Alvarás",
    fileType: "PDF",
    fileSize: "380 KB",
    lastUpdated: "Válido",
    details: [
      "Conforme RDC ANVISA para sal refinado iodado humano",
      "Inspeção técnica aprovada sem restrições"
    ]
  },
  {
    id: "doc-mapa",
    title: "Registro Ministério da Agricultura (MAPA)",
    description: "Certificado de registro de estabelecimento de produtos destinados à alimentação animal.",
    category: "licenca",
    categoryLabel: "Licenças & Alvarás",
    fileType: "PDF",
    fileSize: "425 KB",
    lastUpdated: "Ativo",
    details: [
      "Apto para fornecimento de sal para nutrição animal e fabricação de rações",
      "Linha Sal do Fazendeiro e Sal Vita Agro"
    ]
  },
  {
    id: "doc-cnd",
    title: "Certidão Negativa de Débitos (CND)",
    description: "Certidão conjunta de débitos relativos a tributos federais e à dívida ativa da União.",
    category: "fiscal",
    categoryLabel: "Regularidade Fiscal",
    fileType: "PDF",
    fileSize: "180 KB",
    lastUpdated: "Emitido recentemente",
    details: [
      "Regularidade fiscal perante a União, Estado e Município",
      "Imprescindível para cadastro em grandes indústrias e redes varejistas"
    ]
  },
  {
    id: "doc-pix",
    title: "Dados Bancários & Chaves Pix Oficiais",
    description: "Informações bancárias oficiais para liquidação de faturamento, depósitos e pagamentos de frete.",
    category: "bancario",
    categoryLabel: "Dados Financeiros",
    fileType: "TEXT / PDF",
    fileSize: "120 KB",
    lastUpdated: "Atualizado",
    details: [
      "Conta Jurídica Oficial Sal Vita",
      "Chave Pix CNPJ vinculada ao titular",
      "Instruções para comprovantes de pagamento de frete/pedidos"
    ],
    copyContent: "DADOS BANCÁRIOS OFICIAIS - SAL VITA:\nFavorecido: SAL VITA LTDA\nChave Pix CNPJ: (Consulte o setor financeiro para confirmação)\nInstrução: Enviar comprovante com o número do pedido/atendente."
  }
];

export default function Documentos() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  const [activeTab, setActiveTab] = useState<"produtos" | "empresa">("produtos");
  const [categoryFilter, setCategoryFilter] = useState<string>("todos");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<TechnicalProduct | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Dynamic state loaded from localStorage merged with defaults
  const [productsList, setProductsList] = useState<TechnicalProduct[]>(DEFAULT_PRODUCTS);
  const [companyDocsList, setCompanyDocsList] = useState<CompanyDocument[]>(DEFAULT_COMPANY_DOCS);

  // Admin upload/create modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [addType, setAddType] = useState<"produto" | "empresa">("produto");
  const [formData, setFormData] = useState({
    title: "",
    subTitle: "",
    category: "bigbag",
    brands: "SAL VITA",
    iodineOptions: "Disponível COM e SEM Iodo",
    applications: "",
    targetAudience: "",
    description: "",
    weight: "",
    granulometry: "",
    solubility: "",
    purity: "",
    fileUrl: "",
    fileType: "PDF",
  });

  // Load custom items from localStorage
  useEffect(() => {
    try {
      const savedProducts = localStorage.getItem("sal_vita_custom_products");
      if (savedProducts) {
        const parsed = JSON.parse(savedProducts);
        setProductsList([...DEFAULT_PRODUCTS, ...parsed]);
      }
      const savedDocs = localStorage.getItem("sal_vita_custom_docs");
      if (savedDocs) {
        const parsed = JSON.parse(savedDocs);
        setCompanyDocsList([...DEFAULT_COMPANY_DOCS, ...parsed]);
      }
    } catch (e) {
      console.error("Error reading custom docs", e);
    }
  }, []);

  // Filter products
  const filteredProducts = productsList.filter(product => {
    const matchesCategory = categoryFilter === "todos" || product.category === categoryFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      product.name.toLowerCase().includes(q) ||
      product.subTitle?.toLowerCase().includes(q) ||
      product.description.toLowerCase().includes(q) ||
      product.applications.some(a => a.toLowerCase().includes(q)) ||
      product.targetAudience.some(t => t.toLowerCase().includes(q));
    return matchesCategory && matchesSearch;
  });

  // Filter company docs
  const filteredDocs = companyDocsList.filter(doc => {
    const q = searchQuery.toLowerCase().trim();
    return !q || 
      doc.title.toLowerCase().includes(q) ||
      doc.description.toLowerCase().includes(q) ||
      doc.categoryLabel.toLowerCase().includes(q);
  });

  const handleCopyWhatsApp = (product: TechnicalProduct) => {
    const text = `📌 *FICHA TÉCNICA - ${product.name.toUpperCase()}* (${product.subTitle || product.packageType})

✨ *Aplicações Principais:*
${product.applications.map(a => `• ${a}`).join('\n')}

📦 *Embalagem:* ${product.packageType}
🔹 *Marcas:* ${product.brands.join(' / ')}
🔹 *Opções de Iodo:* ${product.iodineOptions}
🔬 *Granulometria:* ${product.specs.granulometry}
💧 *Solubilidade:* ${product.specs.solubility}
⭐ *Pureza:* ${product.specs.purity}

📍 *Sal Vita - Qualidade Garantida*`;

    navigator.clipboard.writeText(text);
    setCopiedId(product.id);
    toast.success("Ficha técnica copiada! Cole no WhatsApp do cliente.");
    setTimeout(() => setCopiedId(null), 3000);
  };

  const handleCopyDoc = (doc: CompanyDocument) => {
    const text = doc.copyContent || `${doc.title}\n${doc.description}\nStatus: ${doc.lastUpdated}`;
    navigator.clipboard.writeText(text);
    setCopiedId(doc.id);
    toast.success("Dados copiados para a área de transferência!");
    setTimeout(() => setCopiedId(null), 3000);
  };

  const handleCreateDocument = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error("Por favor, preencha o título.");
      return;
    }

    if (addType === "produto") {
      const newProduct: TechnicalProduct = {
        id: `custom-prod-${Date.now()}`,
        name: formData.title,
        subTitle: formData.subTitle || "Ficha Técnica Sal Vita",
        category: formData.category as "bigbag" | "sacaria" | "varejo",
        categoryLabel: formData.category === "bigbag" ? "Big Bag (1.000 kg)" : formData.category === "sacaria" ? "Sacaria (25 kg)" : "Linha Varejo (1 kg)",
        packageType: formData.subTitle || "Embalagem Padrão",
        brands: formData.brands.split(",").map(b => b.trim()),
        iodineOptions: formData.iodineOptions,
        applications: formData.applications ? formData.applications.split("\n").filter(Boolean) : ["Uso industrial e comercial"],
        targetAudience: formData.targetAudience ? formData.targetAudience.split(",").map(t => t.trim()) : ["Clientes Sal Vita"],
        description: formData.description || "Ficha técnica oficial de especificações técnicas do produto Sal Vita.",
        specs: {
          weight: formData.weight || "Conforme embalagem",
          granulometry: formData.granulometry || "Selecionada",
          solubility: formData.solubility || "Alta",
          purity: formData.purity || "NaCl ≥ 98,5%",
          storage: "Local seco e arejado"
        },
        badgeColor: formData.category === "bigbag" ? "bg-blue-600 text-white" : formData.category === "sacaria" ? "bg-orange-600 text-white" : "bg-purple-600 text-white",
        iconType: formData.category as "bigbag" | "sacaria" | "varejo",
        fileUrl: formData.fileUrl,
        isCustom: true
      };

      const updated = [...productsList, newProduct];
      setProductsList(updated);
      const customOnly = updated.filter(p => p.isCustom);
      localStorage.setItem("sal_vita_custom_products", JSON.stringify(customOnly));
      toast.success("Nova Ficha Técnica adicionada com sucesso!");
    } else {
      const newDoc: CompanyDocument = {
        id: `custom-doc-${Date.now()}`,
        title: formData.title,
        description: formData.description || "Documento oficial cadastral da empresa.",
        category: "cadastral",
        categoryLabel: "Documento Cadastral",
        fileType: formData.fileType || "PDF",
        fileSize: "1.2 MB",
        lastUpdated: "Adicionado recentemente pelo Admin",
        details: formData.applications ? formData.applications.split("\n").filter(Boolean) : ["Documento ativo e verificado"],
        fileUrl: formData.fileUrl,
        copyContent: formData.description,
        isCustom: true
      };

      const updated = [...companyDocsList, newDoc];
      setCompanyDocsList(updated);
      const customOnly = updated.filter(d => d.isCustom);
      localStorage.setItem("sal_vita_custom_docs", JSON.stringify(customOnly));
      toast.success("Novo Documento Cadastral adicionado com sucesso!");
    }

    setShowAddModal(false);
    setFormData({
      title: "",
      subTitle: "",
      category: "bigbag",
      brands: "SAL VITA",
      iodineOptions: "Disponível COM e SEM Iodo",
      applications: "",
      targetAudience: "",
      description: "",
      weight: "",
      granulometry: "",
      solubility: "",
      purity: "",
      fileUrl: "",
      fileType: "PDF",
    });
  };

  const handleDeleteItem = (id: string, isProduct: boolean) => {
    if (!confirm("Tem certeza que deseja remover este item?")) return;

    if (isProduct) {
      const updated = productsList.filter(p => p.id !== id);
      setProductsList(updated);
      localStorage.setItem("sal_vita_custom_products", JSON.stringify(updated.filter(p => p.isCustom)));
      toast.success("Produto removido.");
    } else {
      const updated = companyDocsList.filter(d => d.id !== id);
      setCompanyDocsList(updated);
      localStorage.setItem("sal_vita_custom_docs", JSON.stringify(updated.filter(d => d.isCustom)));
      toast.success("Documento removido.");
    }
  };

  const renderProductIllustration = (type: "bigbag" | "sacaria" | "varejo", name: string) => {
    if (type === "bigbag") {
      return (
        <div className="w-full h-40 bg-gradient-to-b from-blue-900 via-slate-900 to-slate-950 rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden group shadow-inner">
          <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-3xl group-hover:bg-blue-500/20 transition-all duration-300" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-400 via-amber-200 to-white flex items-center justify-center shadow-lg mb-2 transform group-hover:scale-105 transition-transform">
              <Package className="w-9 h-9 text-slate-900" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-amber-300 bg-amber-950/80 px-2.5 py-0.5 rounded-full border border-amber-500/40">
              BIG BAG 1.000 KG
            </span>
          </div>
        </div>
      );
    }
    if (type === "sacaria") {
      return (
        <div className="w-full h-40 bg-gradient-to-b from-orange-950 via-slate-900 to-slate-950 rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden group shadow-inner">
          <div className="absolute inset-0 bg-orange-500/10 backdrop-blur-3xl group-hover:bg-orange-500/20 transition-all duration-300" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-400 via-amber-300 to-white flex items-center justify-center shadow-lg mb-2 transform group-hover:scale-105 transition-transform">
              <Layers className="w-9 h-9 text-slate-900" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-orange-300 bg-orange-950/80 px-2.5 py-0.5 rounded-full border border-orange-500/40">
              SACARIA 25 KG
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="w-full h-40 bg-gradient-to-b from-cyan-950 via-slate-900 to-slate-950 rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden group shadow-inner">
        <div className="absolute inset-0 bg-cyan-500/10 backdrop-blur-3xl group-hover:bg-cyan-500/20 transition-all duration-300" />
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-300 via-blue-200 to-white flex items-center justify-center shadow-lg mb-2 transform group-hover:scale-105 transition-transform">
            <ShoppingCart className="w-9 h-9 text-slate-900" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-cyan-300 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-500/40">
            FARDO VAREJO 1 KG
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 md:p-8 shadow-xl border border-white/10">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-medium">
              <Award size={14} />
              Central Oficial de Documentação & Fichas Técnicas
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Documentos & Fichas Técnicas Sal Vita
            </h1>
            <p className="text-slate-300 text-sm md:text-base max-w-2xl">
              Acesse rapidamente as fichas técnicas de toda a linha de sais, especificações de embalagem e documentos cadastrais da empresa para envio aos clientes.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Admin Add Button */}
            {isAdmin && (
              <Button
                onClick={() => setShowAddModal(true)}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-lg gap-2 px-5 py-6 rounded-xl border border-emerald-400/30"
              >
                <Plus size={20} />
                + Novo Documento / Ficha
              </Button>
            )}

            <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center min-w-[110px]">
              <span className="block text-2xl font-bold text-amber-400">{productsList.length}</span>
              <span className="text-xs text-slate-300">Produtos</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center min-w-[110px]">
              <span className="block text-2xl font-bold text-emerald-400">{companyDocsList.length}</span>
              <span className="text-xs text-slate-300">Docs Cadastrais</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Toolbar & Search */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-white p-4 rounded-xl border shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("produtos")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "produtos"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Package size={16} className="text-blue-600" />
            Fichas Técnicas ({productsList.length})
          </button>
          <button
            onClick={() => setActiveTab("empresa")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "empresa"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Building2 size={16} className="text-emerald-600" />
            Documentos Empresa ({companyDocsList.length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[280px] md:min-w-[340px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder={activeTab === "produtos" ? "Buscar por tipo de sal, aplicação, 25kg, bigbag..." : "Buscar documento da empresa..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-slate-50 border-slate-200 focus:bg-white text-sm"
          />
        </div>
      </div>

      {/* Category Pills (Product Mode Only) */}
      {activeTab === "produtos" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-2">Filtrar Categoria:</span>
          {[
            { id: "todos", label: "Todos os Produtos" },
            { id: "bigbag", label: "Big Bags (1.000 KG)" },
            { id: "sacaria", label: "Sacarias (25 KG)" },
            { id: "varejo", label: "Linha Varejo (1 KG)" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                categoryFilter === cat.id
                  ? "bg-slate-900 text-white shadow"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* TAB 1: TECHNICAL PRODUCTS */}
      {activeTab === "produtos" && (
        <div className="space-y-6">
          {filteredProducts.length === 0 ? (
            <Card className="bg-slate-50 border-dashed border-2 text-center p-8">
              <Package size={40} className="mx-auto text-slate-400 mb-2" />
              <p className="text-slate-600 font-medium">Nenhum produto encontrado para a busca "{searchQuery}".</p>
              <Button variant="outline" size="sm" onClick={() => { setSearchQuery(""); setCategoryFilter("todos"); }} className="mt-4">
                Limpar Filtros
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product) => (
                <Card key={product.id} className="flex flex-col overflow-hidden hover:shadow-lg transition-all duration-200 border-slate-200 group relative">
                  {/* Custom items trash icon for Admin */}
                  {isAdmin && product.isCustom && (
                    <button
                      onClick={() => handleDeleteItem(product.id, true)}
                      title="Excluir item criado"
                      className="absolute top-3 left-3 z-20 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-lg shadow transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}

                  {/* Card Visual Header */}
                  <div className="p-3 bg-slate-50 border-b relative">
                    {renderProductIllustration(product.iconType, product.name)}
                    <Badge className={`absolute top-5 right-5 ${product.badgeColor} shadow-md text-[10px] font-bold uppercase tracking-wider`}>
                      {product.packageType}
                    </Badge>
                  </div>

                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-bold text-slate-900 leading-tight">
                          {product.name}
                        </CardTitle>
                        <CardDescription className="text-xs text-blue-600 font-semibold mt-0.5">
                          {product.subTitle}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 space-y-4 text-xs">
                    {/* Marcas & Iodo */}
                    <div className="bg-slate-50 p-2.5 rounded-lg space-y-1 border border-slate-100">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Award size={14} className="text-amber-500 flex-shrink-0" />
                        <span className="font-semibold">Marcas:</span>
                        <span className="text-slate-900 font-medium">{product.brands.join(", ")}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Info size={14} className="text-blue-500 flex-shrink-0" />
                        <span className="font-semibold">Iodo:</span>
                        <span className="text-slate-900">{product.iodineOptions}</span>
                      </div>
                    </div>

                    {/* Principais Aplicações */}
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs mb-1.5 flex items-center gap-1">
                        <Factory size={13} className="text-slate-500" />
                        Aplicações Recomendadas:
                      </h4>
                      <ul className="space-y-1 text-slate-600">
                        {product.applications.map((app, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 flex-shrink-0" />
                            <span>{app}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Especificações Rápidas */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-blue-50/50 p-2 rounded border border-blue-100">
                        <span className="block text-[10px] text-blue-700 font-semibold uppercase">Granulometria</span>
                        <span className="text-slate-800 font-medium text-[11px] truncate block">{product.specs.granulometry}</span>
                      </div>
                      <div className="bg-emerald-50/50 p-2 rounded border border-emerald-100">
                        <span className="block text-[10px] text-emerald-700 font-semibold uppercase">Pureza (NaCl)</span>
                        <span className="text-slate-800 font-medium text-[11px] truncate block">{product.specs.purity}</span>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="pt-3 border-t bg-slate-50/50 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedProduct(product)}
                      className="flex-1 text-xs gap-1.5 min-h-[40px]"
                    >
                      <Eye size={14} />
                      Ver Ficha
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleCopyWhatsApp(product)}
                      className="flex-1 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white min-h-[40px]"
                    >
                      {copiedId === product.id ? <Check size={14} /> : <Share2 size={14} />}
                      {copiedId === product.id ? "Copiado!" : "WhatsApp"}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: COMPANY DOCUMENTS */}
      {activeTab === "empresa" && (
        <div className="space-y-6">
          {filteredDocs.length === 0 ? (
            <Card className="bg-slate-50 border-dashed border-2 text-center p-8">
              <Building2 size={40} className="mx-auto text-slate-400 mb-2" />
              <p className="text-slate-600 font-medium">Nenhum documento cadastral encontrado.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDocs.map((doc) => (
                <Card key={doc.id} className="hover:shadow-md transition-shadow border-slate-200 relative">
                  {isAdmin && doc.isCustom && (
                    <button
                      onClick={() => handleDeleteItem(doc.id, false)}
                      title="Excluir documento criado"
                      className="absolute top-3 right-3 z-20 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-lg shadow transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}

                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center flex-shrink-0">
                          <FileText size={20} />
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold text-slate-900">{doc.title}</CardTitle>
                          <span className="text-xs text-blue-600 font-medium">{doc.categoryLabel}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-slate-50">
                        {doc.fileType} • {doc.fileSize}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-3 text-xs">
                    <p className="text-slate-600">{doc.description}</p>
                    
                    {doc.details && (
                      <div className="bg-slate-50 p-2.5 rounded-lg space-y-1 text-slate-700 border border-slate-100">
                        {doc.details.map((detail, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <ShieldCheck size={13} className="text-emerald-600 flex-shrink-0" />
                            <span>{detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="pt-3 border-t flex justify-between items-center text-xs">
                    <span className="text-slate-400 text-[11px]">{doc.lastUpdated}</span>
                    <div className="flex gap-2">
                      {doc.copyContent && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleCopyDoc(doc)}
                          className="text-xs gap-1"
                        >
                          {copiedId === doc.id ? <Check size={14} /> : <Copy size={14} />}
                          Copiar Dados
                        </Button>
                      )}
                      <Button 
                        size="sm" 
                        onClick={() => {
                          if (doc.fileUrl) {
                            window.open(doc.fileUrl, "_blank");
                          } else {
                            toast.info(`A visualização do documento (${doc.title}) foi acionada.`);
                          }
                        }}
                        className="text-xs gap-1 bg-slate-900 hover:bg-slate-800"
                      >
                        <Download size={14} />
                        Baixar Documento
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL ADMIN: ADICIONAR NOVO DOCUMENTO OU FICHA TÉCNICA */}
      {showAddModal && (
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <FilePlus size={22} className="text-emerald-600" />
                Cadastrar Novo Documento ou Ficha Técnica
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Preencha as informações para disponibilizar o documento para os atendentes.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateDocument} className="space-y-4 py-2 text-xs md:text-sm">
              {/* Tipo de Documento */}
              <div>
                <label className="block font-semibold mb-1 text-slate-800">Tipo de Documentação *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAddType("produto")}
                    className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition ${
                      addType === "produto"
                        ? "bg-blue-600 text-white border-blue-600 shadow"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    <Package size={16} />
                    Ficha Técnica de Sal
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddType("empresa")}
                    className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition ${
                      addType === "empresa"
                        ? "bg-emerald-600 text-white border-emerald-600 shadow"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    <Building2 size={16} />
                    Documento da Empresa
                  </button>
                </div>
              </div>

              {/* Título */}
              <div>
                <label className="block font-semibold mb-1 text-slate-800">Título / Nome do Documento *</label>
                <Input
                  type="text"
                  placeholder={addType === "produto" ? "Ex: Sal Moído Premium 25 KG" : "Ex: Alvará de Funcionamento 2027"}
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              {/* Campos específicos para Produto */}
              {addType === "produto" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-800">Categoria de Embalagem</label>
                      <select
                        value={formData.category}
                        onChange={e => setFormData({ ...formData, category: e.target.value as any })}
                        className="w-full px-3 py-2 border rounded-md text-xs bg-white"
                      >
                        <option value="bigbag">Big Bag (1.000 KG)</option>
                        <option value="sacaria">Sacaria (25 KG)</option>
                        <option value="varejo">Linha Varejo (1 KG)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-800">Subtítulo / Apresentação</label>
                      <Input
                        type="text"
                        placeholder="Ex: Saco de 25 KG"
                        value={formData.subTitle}
                        onChange={e => setFormData({ ...formData, subTitle: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-800">Marcas</label>
                      <Input
                        type="text"
                        placeholder="SAL VITA, SAL DO FAZENDEIRO"
                        value={formData.brands}
                        onChange={e => setFormData({ ...formData, brands: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-800">Opções de Iodo</label>
                      <Input
                        type="text"
                        placeholder="Com e Sem Iodo"
                        value={formData.iodineOptions}
                        onChange={e => setFormData({ ...formData, iodineOptions: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-slate-800">Aplicações Recomendadas (uma por linha)</label>
                    <Textarea
                      rows={2}
                      placeholder="Fábricas de rações&#10;Laticínios e frigoríficos"
                      value={formData.applications}
                      onChange={e => setFormData({ ...formData, applications: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-800">Granulometria</label>
                      <Input
                        type="text"
                        placeholder="Refinado / Fino"
                        value={formData.granulometry}
                        onChange={e => setFormData({ ...formData, granulometry: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-800">Solubilidade</label>
                      <Input
                        type="text"
                        placeholder="Alta / Rápida"
                        value={formData.solubility}
                        onChange={e => setFormData({ ...formData, solubility: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-800">Pureza (NaCl)</label>
                      <Input
                        type="text"
                        placeholder="NaCl ≥ 99,0%"
                        value={formData.purity}
                        onChange={e => setFormData({ ...formData, purity: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Descrição Geral / Conteúdo */}
              <div>
                <label className="block font-semibold mb-1 text-slate-800">Descrição / Instruções do Documento</label>
                <Textarea
                  rows={3}
                  placeholder="Descreva detalhes da ficha técnica ou orientações do documento..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              {/* Link do Arquivo / PDF */}
              <div>
                <label className="block font-semibold mb-1 text-slate-800">Link do Arquivo / PDF (URL ou armazenamento)</label>
                <Input
                  type="text"
                  placeholder="https://sua-empresa.com/documento.pdf"
                  value={formData.fileUrl}
                  onChange={e => setFormData({ ...formData, fileUrl: e.target.value })}
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                  Salvar Documento
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL FICHA TÉCNICA DETALHADA */}
      {selectedProduct && (
        <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <Badge className={`${selectedProduct.badgeColor}`}>
                  {selectedProduct.packageType}
                </Badge>
                <span className="text-xs text-slate-500 font-medium">Especificação Técnica Oficial</span>
              </div>
              <DialogTitle className="text-xl font-bold text-slate-900">
                {selectedProduct.name}
              </DialogTitle>
              <DialogDescription className="text-sm text-blue-600 font-semibold">
                {selectedProduct.subTitle}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm py-2">
              <p className="text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs md:text-sm leading-relaxed">
                {selectedProduct.description}
              </p>

              {/* Tabela de Especificações */}
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-amber-500" />
                  Especificações Técnicas:
                </h4>
                <div className="border rounded-xl overflow-hidden divide-y text-xs">
                  <div className="grid grid-cols-3 p-2.5 bg-slate-50 font-semibold text-slate-700">
                    <span>Parâmetro</span>
                    <span className="col-span-2">Especificação Técnica</span>
                  </div>
                  <div className="grid grid-cols-3 p-2.5 text-slate-800">
                    <span className="font-semibold text-slate-600">Embalagem</span>
                    <span className="col-span-2">{selectedProduct.specs.weight}</span>
                  </div>
                  <div className="grid grid-cols-3 p-2.5 text-slate-800 bg-slate-50/50">
                    <span className="font-semibold text-slate-600">Granulometria</span>
                    <span className="col-span-2">{selectedProduct.specs.granulometry}</span>
                  </div>
                  <div className="grid grid-cols-3 p-2.5 text-slate-800">
                    <span className="font-semibold text-slate-600">Solubilidade</span>
                    <span className="col-span-2">{selectedProduct.specs.solubility}</span>
                  </div>
                  <div className="grid grid-cols-3 p-2.5 text-slate-800 bg-slate-50/50">
                    <span className="font-semibold text-slate-600">Pureza / NaCl</span>
                    <span className="col-span-2">{selectedProduct.specs.purity}</span>
                  </div>
                  <div className="grid grid-cols-3 p-2.5 text-slate-800">
                    <span className="font-semibold text-slate-600">Armazenamento</span>
                    <span className="col-span-2">{selectedProduct.specs.storage}</span>
                  </div>
                </div>
              </div>

              {/* Aplicações e Público */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-100 text-xs space-y-1">
                  <h5 className="font-bold text-blue-900 flex items-center gap-1">
                    <Factory size={14} /> Aplicações Principais
                  </h5>
                  <ul className="space-y-1 text-blue-800 pt-1">
                    {selectedProduct.applications.map((app, i) => (
                      <li key={i}>• {app}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-100 text-xs space-y-1">
                  <h5 className="font-bold text-amber-900 flex items-center gap-1">
                    <Truck size={14} /> Público-Alvo / Compradores
                  </h5>
                  <ul className="space-y-1 text-amber-800 pt-1">
                    {selectedProduct.targetAudience.map((target, i) => (
                      <li key={i}>• {target}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setSelectedProduct(null)}
                className="text-xs"
              >
                Fechar
              </Button>
              <Button
                onClick={() => handleCopyWhatsApp(selectedProduct)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
              >
                <Share2 size={14} />
                Enviar no WhatsApp
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
