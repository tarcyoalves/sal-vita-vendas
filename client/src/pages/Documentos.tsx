import { useState, useEffect, useRef } from "react";
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
  Paperclip,
  FilePlus,
  X,
  FileCheck,
  Microscope,
  FileSpreadsheet,
  Camera,
  ImageIcon,
  RotateCcw,
  Upload,
  FolderPlus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "../_core/hooks/useAuth";

export interface AttachedDoc {
  id: string;
  title: string;
  fileUrl: string;
  fileName?: string;
  fileType: "PDF" | "LAUDO" | "CERTIFICADO" | "IMAGEM" | "OUTRO";
  fileSize?: string;
  addedAt?: string;
}

export interface TechnicalProduct {
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
  imageUrl?: string; // Custom uploaded product photo
  documents: AttachedDoc[];
}

export interface CompanyCategory {
  id: string;
  title: string;
  description: string;
  categoryLabel: string;
  iconBg: string;
  details: string[];
  copyContent?: string;
  documents: AttachedDoc[];
}

// NO FAKE OR FICTITIOUS DOCUMENTS - ALL START CLEAN & EMPTY UNTIL USER UPLOADS REAL FILES
const INITIAL_PRODUCTS: TechnicalProduct[] = [
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
    iconType: "bigbag",
    documents: []
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
    iconType: "bigbag",
    documents: []
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
    iconType: "bigbag",
    documents: []
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
    iconType: "sacaria",
    documents: []
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
    iconType: "sacaria",
    documents: []
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
    iconType: "sacaria",
    documents: []
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
    iconType: "varejo",
    documents: []
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
    iconType: "varejo",
    documents: []
  }
];

const INITIAL_COMPANY_CATEGORIES: CompanyCategory[] = [
  {
    id: "comp-cadastral",
    title: "Dados Cadastrais & CNPJ",
    description: "Comprovantes cadastrais oficiais, Inscrição Estadual e Razão Social da empresa.",
    categoryLabel: "Cadastro & Identificação",
    iconBg: "bg-blue-100 text-blue-800",
    details: [
      "Razão Social: T A CONSULTORIA EMPRESARIAL LTDA",
      "Nome Fantasia: SAL VITA",
      "Situação Cadastral: Ativa e Regularizada",
      "Inscrição Estadual: Ativa"
    ],
    copyContent: "DADOS CADASTRAIS SAL VITA:\nRazão Social: T A CONSULTORIA EMPRESARIAL LTDA\nCNPJ: Inscrição Ativa\nAtividade: Fabricação e Comércio Atacadista de Sal",
    documents: []
  },
  {
    id: "comp-licencas",
    title: "Alvarás & Licenças Sanitárias",
    description: "Alvará municipal, autorização de funcionamento e vigilância sanitária ANVISA/MAPA.",
    categoryLabel: "Licenças & Alvarás",
    iconBg: "bg-emerald-100 text-emerald-800",
    details: [
      "Alvará de Funcionamento Municipal Válido",
      "Licença Sanitária para Alimentos",
      "Registro MAPA para Nutrição Animal"
    ],
    documents: []
  },
  {
    id: "comp-fiscal",
    title: "Regularidade Fiscal (CND)",
    description: "Certidões negativas de débitos municipais, estaduais e federais para cadastro em clientes.",
    categoryLabel: "Regularidade Fiscal",
    iconBg: "bg-amber-100 text-amber-800",
    details: [
      "Certidão Conjunta Receita Federal / PGFN",
      "Certidão Negativa Estadual",
      "Certidão Negativa Municipal"
    ],
    documents: []
  },
  {
    id: "comp-financeiro",
    title: "Dados Bancários & Chaves Pix Oficiais",
    description: "Dados para faturamento, pagamento de fretes, depósitos e liquidação de pedidos.",
    categoryLabel: "Financeiro & Pix",
    iconBg: "bg-purple-100 text-purple-800",
    details: [
      "Conta Jurídica Oficial Sal Vita",
      "Chave Pix CNPJ vinculada",
      "Comprovantes de liquidação"
    ],
    copyContent: "DADOS BANCÁRIOS OFICIAIS - SAL VITA:\nFavorecido: SAL VITA LTDA\nChave Pix CNPJ: (Solicite ao setor financeiro para confirmação)\nInstrução: Enviar comprovante informando o número do pedido/atendente.",
    documents: []
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

  // Hidden File Inputs for native computer upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic state loaded from localStorage
  const [productsList, setProductsList] = useState<TechnicalProduct[]>(INITIAL_PRODUCTS);
  const [companyCategoriesList, setCompanyCategoriesList] = useState<CompanyCategory[]>(INITIAL_COMPANY_CATEGORIES);

  // Modal attach document state
  const [attachModalOpen, setAttachModalOpen] = useState<boolean>(false);
  const [targetTargetId, setTargetTargetId] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<"product" | "company">("product");

  const [newDocData, setNewDocData] = useState({
    title: "",
    fileUrl: "",
    fileName: "",
    fileType: "PDF" as "PDF" | "LAUDO" | "CERTIFICADO" | "IMAGEM" | "OUTRO",
    fileSize: "",
  });

  // Modal edit product image state (Admin only)
  const [editImageModalOpen, setEditImageModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<TechnicalProduct | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState<string>("");

  // Load real uploaded items from localStorage (filtering out any old fake '#' items)
  useEffect(() => {
    try {
      const savedProducts = localStorage.getItem("sal_vita_products_v3");
      if (savedProducts) {
        const parsed: TechnicalProduct[] = JSON.parse(savedProducts);
        // Clean out any leftover fake '#' items from previous tests
        const cleaned = parsed.map(p => ({
          ...p,
          documents: (p.documents || []).filter(d => d.fileUrl && d.fileUrl !== "#")
        }));
        setProductsList(cleaned);
      }

      const savedCompany = localStorage.getItem("sal_vita_company_v3");
      if (savedCompany) {
        const parsed: CompanyCategory[] = JSON.parse(savedCompany);
        const cleaned = parsed.map(c => ({
          ...c,
          documents: (c.documents || []).filter(d => d.fileUrl && d.fileUrl !== "#")
        }));
        setCompanyCategoriesList(cleaned);
      }
    } catch (e) {
      console.error("Error reading saved card docs", e);
    }
  }, []);

  // Save to localStorage v3
  const saveProductsToStorage = (products: TechnicalProduct[]) => {
    setProductsList(products);
    localStorage.setItem("sal_vita_products_v3", JSON.stringify(products));
  };

  const saveCompanyToStorage = (company: CompanyCategory[]) => {
    setCompanyCategoriesList(company);
    localStorage.setItem("sal_vita_company_v3", JSON.stringify(company));
  };

  // Filter products
  const filteredProducts = productsList.filter(product => {
    const matchesCategory = categoryFilter === "todos" || product.category === categoryFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      product.name.toLowerCase().includes(q) ||
      product.subTitle?.toLowerCase().includes(q) ||
      product.description.toLowerCase().includes(q) ||
      product.applications.some(a => a.toLowerCase().includes(q)) ||
      product.documents.some(d => d.title.toLowerCase().includes(q));
    return matchesCategory && matchesSearch;
  });

  // Filter company categories
  const filteredCompanyCategories = companyCategoriesList.filter(cat => {
    const q = searchQuery.toLowerCase().trim();
    return !q || 
      cat.title.toLowerCase().includes(q) ||
      cat.description.toLowerCase().includes(q) ||
      cat.documents.some(d => d.title.toLowerCase().includes(q));
  });

  const handleOpenAttachModal = (id: string, type: "product" | "company") => {
    setTargetTargetId(id);
    setTargetType(type);
    setNewDocData({
      title: "",
      fileUrl: "",
      fileName: "",
      fileType: "PDF",
      fileSize: "",
    });
    setAttachModalOpen(true);
  };

  // NATIVE FILE SELECTOR FROM COMPUTER (FileReader DataURL)
  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    const sizeStr = file.size > 1024 * 1024 ? `${sizeMb} MB` : `${Math.round(file.size / 1024)} KB`;
    const ext = file.name.split('.').pop()?.toUpperCase() || 'ARQUIVO';

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replaceAll("_", " ").toUpperCase();
      setNewDocData(prev => ({
        ...prev,
        title: prev.title || cleanTitle,
        fileName: file.name,
        fileUrl: dataUrl,
        fileSize: `${ext} • ${sizeStr}`,
        fileType: ext.includes("PDF") ? "PDF" : ext.includes("PNG") || ext.includes("JPG") ? "IMAGEM" : "PDF"
      }));
      toast.success(`Arquivo "${file.name}" pronto para ser anexado!`);
    };
    reader.readAsDataURL(file);
  };

  // NATIVE PHOTO SELECTOR FROM COMPUTER FOR PRODUCT CARD
  const handleLocalPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImageUrlInput(dataUrl);
      toast.success(`Foto "${file.name}" selecionada!`);
    };
    reader.readAsDataURL(file);
  };

  const handleOpenImageModal = (product: TechnicalProduct) => {
    setEditingProduct(product);
    setImageUrlInput(product.imageUrl || "");
    setEditImageModalOpen(true);
  };

  const handleSaveProductImage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const updatedProducts = productsList.map(p => {
      if (p.id === editingProduct.id) {
        return { ...p, imageUrl: imageUrlInput.trim() || undefined };
      }
      return p;
    });

    saveProductsToStorage(updatedProducts);
    toast.success("Foto do produto salva no card!");
    setEditImageModalOpen(false);
    setEditingProduct(null);
  };

  const handleResetProductImage = () => {
    if (!editingProduct) return;
    const updatedProducts = productsList.map(p => {
      if (p.id === editingProduct.id) {
        const copy = { ...p };
        delete copy.imageUrl;
        return copy;
      }
      return p;
    });
    saveProductsToStorage(updatedProducts);
    toast.success("Foto restaurada para a ilustração padrão.");
    setEditImageModalOpen(false);
    setEditingProduct(null);
  };

  const handleSaveAttachedDoc = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newDocData.title.trim()) {
      toast.error("Preencha o título do documento.");
      return;
    }

    if (!newDocData.fileUrl || newDocData.fileUrl === "#") {
      toast.error("Por favor, selecione um arquivo do computador.");
      return;
    }

    const docToAdd: AttachedDoc = {
      id: `attached-${Date.now()}`,
      title: newDocData.title.trim(),
      fileName: newDocData.fileName || `${newDocData.title.trim()}.pdf`,
      fileUrl: newDocData.fileUrl,
      fileType: newDocData.fileType,
      fileSize: newDocData.fileSize || "PDF",
      addedAt: "Real Anexado"
    };

    if (targetType === "product" && targetTargetId) {
      const updatedProducts = productsList.map(p => {
        if (p.id === targetTargetId) {
          // Replace existing or add file cleanly
          return { ...p, documents: [...p.documents, docToAdd] };
        }
        return p;
      });
      saveProductsToStorage(updatedProducts);
      toast.success(`Arquivo real anexado no produto com sucesso!`);
    } else if (targetType === "company" && targetTargetId) {
      const updatedCompany = companyCategoriesList.map(c => {
        if (c.id === targetTargetId) {
          return { ...c, documents: [...c.documents, docToAdd] };
        }
        return c;
      });
      saveCompanyToStorage(updatedCompany);
      toast.success(`Arquivo real anexado no card da empresa!`);
    }

    setAttachModalOpen(false);
  };

  const handleDownloadFile = (doc: AttachedDoc) => {
    if (!doc.fileUrl || doc.fileUrl === "#") {
      toast.error("Arquivo indisponível.");
      return;
    }

    // Trigger download of the exact real file stored
    const link = document.createElement("a");
    link.href = doc.fileUrl;
    link.download = doc.fileName || `${doc.title}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Download de "${doc.fileName || doc.title}" iniciado!`);
  };

  const handleDeleteAttachedDoc = (cardId: string, docId: string, isProduct: boolean) => {
    if (!confirm("Remover este arquivo anexado do card?")) return;

    if (isProduct) {
      const updated = productsList.map(p => {
        if (p.id === cardId) {
          return { ...p, documents: p.documents.filter(d => d.id !== docId) };
        }
        return p;
      });
      saveProductsToStorage(updated);
      toast.success("Arquivo removido.");
    } else {
      const updated = companyCategoriesList.map(c => {
        if (c.id === cardId) {
          return { ...c, documents: c.documents.filter(d => d.id !== docId) };
        }
        return c;
      });
      saveCompanyToStorage(updated);
      toast.success("Arquivo removido.");
    }
  };

  const handleCopyWhatsApp = (product: TechnicalProduct) => {
    const docsListText = product.documents.length > 0 
      ? product.documents.map(d => `📄 ${d.title}`).join('\n')
      : "📄 Ficha Técnica Sob Consulta";

    const text = `📌 *FICHA TÉCNICA - ${product.name.toUpperCase()}* (${product.subTitle || product.packageType})

✨ *Aplicações Principais:*
${product.applications.map(a => `• ${a}`).join('\n')}

📦 *Embalagem:* ${product.packageType}
🔹 *Marcas:* ${product.brands.join(' / ')}
🔹 *Opções de Iodo:* ${product.iodineOptions}
🔬 *Granulometria:* ${product.specs.granulometry}
💧 *Solubilidade:* ${product.specs.solubility}
⭐ *Pureza:* ${product.specs.purity}

📂 *Documentos Anexados:*
${docsListText}

📍 *Sal Vita - Qualidade Garantida*`;

    navigator.clipboard.writeText(text);
    setCopiedId(product.id);
    toast.success("Ficha técnica copiada! Cole no WhatsApp do cliente.");
    setTimeout(() => setCopiedId(null), 3000);
  };

  const handleCopyText = (content?: string, id?: string) => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    if (id) setCopiedId(id);
    toast.success("Dados copiados para a área de transferência!");
    setTimeout(() => setCopiedId(null), 3000);
  };

  const getDocIcon = (type: string) => {
    switch (type) {
      case "LAUDO":
        return <Microscope size={15} className="text-purple-600 flex-shrink-0" />;
      case "CERTIFICADO":
        return <FileCheck size={15} className="text-emerald-600 flex-shrink-0" />;
      case "IMAGEM":
        return <FileSpreadsheet size={15} className="text-amber-600 flex-shrink-0" />;
      default:
        return <FileText size={15} className="text-blue-600 flex-shrink-0" />;
    }
  };

  const renderProductIllustration = (product: TechnicalProduct) => {
    // Custom product photo uploaded by Admin
    if (product.imageUrl) {
      return (
        <div className="w-full h-36 bg-slate-100 rounded-xl p-2 flex items-center justify-center relative overflow-hidden group shadow-inner border border-slate-200">
          <img 
            src={product.imageUrl} 
            alt={product.name}
            className="w-full h-full object-contain transform group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>
      );
    }

    // Default Vector Illustrations
    if (product.iconType === "bigbag") {
      return (
        <div className="w-full h-36 bg-gradient-to-b from-blue-900 via-slate-900 to-slate-950 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group shadow-inner">
          <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-3xl group-hover:bg-blue-500/20 transition-all duration-300" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-400 via-amber-200 to-white flex items-center justify-center shadow-lg mb-1.5 transform group-hover:scale-105 transition-transform">
              <Package className="w-8 h-8 text-slate-900" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/40">
              BIG BAG 1.000 KG
            </span>
          </div>
        </div>
      );
    }
    if (product.iconType === "sacaria") {
      return (
        <div className="w-full h-36 bg-gradient-to-b from-orange-950 via-slate-900 to-slate-950 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group shadow-inner">
          <div className="absolute inset-0 bg-orange-500/10 backdrop-blur-3xl group-hover:bg-orange-500/20 transition-all duration-300" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-orange-400 via-amber-300 to-white flex items-center justify-center shadow-lg mb-1.5 transform group-hover:scale-105 transition-transform">
              <Layers className="w-8 h-8 text-slate-900" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-orange-300 bg-orange-950/80 px-2 py-0.5 rounded-full border border-orange-500/40">
              SACARIA 25 KG
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="w-full h-36 bg-gradient-to-b from-cyan-950 via-slate-900 to-slate-950 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group shadow-inner">
        <div className="absolute inset-0 bg-cyan-500/10 backdrop-blur-3xl group-hover:bg-cyan-500/20 transition-all duration-300" />
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-300 via-blue-200 to-white flex items-center justify-center shadow-lg mb-1.5 transform group-hover:scale-105 transition-transform">
            <ShoppingCart className="w-8 h-8 text-slate-900" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-500/40">
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
              Anexe os arquivos reais do seu computador diretamente no card de cada produto ou categoria da empresa.
            </p>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center min-w-[110px]">
              <span className="block text-2xl font-bold text-amber-400">{productsList.length}</span>
              <span className="text-xs text-slate-300">Produtos</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center min-w-[110px]">
              <span className="block text-2xl font-bold text-emerald-400">{companyCategoriesList.length}</span>
              <span className="text-xs text-slate-300">Docs Empresa</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Toolbar & Search */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center bg-white p-4 rounded-xl border shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setActiveTab("produtos")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "produtos"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Package size={16} className="text-blue-600" />
            Fichas dos Produtos ({productsList.length})
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
            Documentos da Empresa ({companyCategoriesList.length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 lg:max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder={activeTab === "produtos" ? "Buscar por produto, laudo, aplicação..." : "Buscar por CNPJ, alvará, licença..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-slate-50 border-slate-200 focus:bg-white text-sm w-full"
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

      {/* TAB 1: PRODUCT CARDS WITH ATTACHED DOCS & UPLOAD */}
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
                <Card key={product.id} className="flex flex-col overflow-hidden hover:shadow-xl transition-all duration-200 border-slate-200 group bg-white">
                  {/* Card Visual Header */}
                  <div className="p-3 bg-slate-50 border-b relative">
                    {renderProductIllustration(product)}

                    <Badge className={`absolute top-4 right-4 ${product.badgeColor} shadow-md text-[10px] font-bold uppercase tracking-wider`}>
                      {product.packageType}
                    </Badge>

                    {/* Admin Button to Alter Product Photo */}
                    {isAdmin && (
                      <button
                        onClick={() => handleOpenImageModal(product)}
                        className="absolute bottom-4 left-4 z-20 bg-slate-900/90 hover:bg-slate-950 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1.5 backdrop-blur-md border border-white/20 transition transform active:scale-95"
                      >
                        <Camera size={13} className="text-amber-400" />
                        Alterar Foto
                      </button>
                    )}
                  </div>

                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold text-slate-900 leading-tight">
                      {product.name}
                    </CardTitle>
                    <CardDescription className="text-xs text-blue-600 font-semibold mt-0.5">
                      {product.subTitle}
                    </CardDescription>
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

                    {/* Aplicações Recomendadas */}
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

                    {/* 📂 DOCUMENTOS REALMENTE ANEXADOS AO CARD DESTE PRODUTO */}
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          <Paperclip size={14} className="text-emerald-600" />
                          Arquivo Anexado ({product.documents.length}):
                        </h4>
                        
                        {/* Admin Add Document Button to this specific Product Card */}
                        {isAdmin && (
                          <button
                            onClick={() => handleOpenAttachModal(product.id, "product")}
                            className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1 transition"
                          >
                            <Plus size={13} />
                            Anexar Arquivo
                          </button>
                        )}
                      </div>

                      {product.documents.length === 0 ? (
                        <div className="bg-slate-50 p-3 rounded-xl text-center text-slate-400 text-[11px] border border-dashed">
                          Nenhum arquivo anexado ainda neste produto.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {product.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200 transition"
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-2 overflow-hidden">
                                {getDocIcon(doc.fileType)}
                                <div className="min-w-0 flex-1">
                                  <span className="font-bold text-slate-900 text-xs block truncate" title={doc.title}>
                                    {doc.title}
                                  </span>
                                  {doc.fileSize && (
                                    <span className="text-[10px] text-slate-400 block truncate">{doc.fileSize}</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => handleDownloadFile(doc)}
                                  title="Baixar arquivo real do computador"
                                  className="text-xs font-bold text-blue-700 bg-white border border-blue-200 hover:bg-blue-600 hover:text-white px-2.5 py-1 rounded-lg transition flex items-center gap-1 shadow-sm"
                                >
                                  <Download size={13} />
                                  Baixar
                                </button>

                                {isAdmin && (
                                  <button
                                    onClick={() => handleDeleteAttachedDoc(product.id, doc.id, true)}
                                    title="Remover anexo"
                                    className="text-slate-400 hover:text-red-600 p-1.5 rounded transition"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>

                  <CardFooter className="pt-3 border-t bg-slate-50/50 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedProduct(product)}
                      className="flex-1 text-xs gap-1.5 min-h-[38px]"
                    >
                      <Eye size={14} />
                      Ver Ficha
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleCopyWhatsApp(product)}
                      className="flex-1 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white min-h-[38px]"
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

      {/* TAB 2: COMPANY CARDS WITH ATTACHED DOCS & UPLOAD */}
      {activeTab === "empresa" && (
        <div className="space-y-6">
          {filteredCompanyCategories.length === 0 ? (
            <Card className="bg-slate-50 border-dashed border-2 text-center p-8">
              <Building2 size={40} className="mx-auto text-slate-400 mb-2" />
              <p className="text-slate-600 font-medium">Nenhum card cadastral encontrado.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredCompanyCategories.map((comp) => (
                <Card key={comp.id} className="hover:shadow-md transition-shadow border-slate-200 flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl ${comp.iconBg} flex items-center justify-center flex-shrink-0 font-bold`}>
                          <Building2 size={20} />
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold text-slate-900">{comp.title}</CardTitle>
                          <span className="text-xs text-blue-600 font-medium">{comp.categoryLabel}</span>
                        </div>
                      </div>
                      
                      {isAdmin && (
                        <button
                          onClick={() => handleOpenAttachModal(comp.id, "company")}
                          className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition shrink-0"
                        >
                          <Plus size={14} />
                          Anexar Arquivo
                        </button>
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4 text-xs flex-1">
                    <p className="text-slate-600">{comp.description}</p>

                    {/* Detalhes do cadastro */}
                    {comp.details && comp.details.length > 0 && (
                      <div className="bg-slate-50 p-3 rounded-xl space-y-1.5 text-slate-700 border border-slate-100">
                        {comp.details.map((detail, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <ShieldCheck size={14} className="text-emerald-600 flex-shrink-0" />
                            <span>{detail}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 📂 DOCUMENTOS REALMENTE ANEXADOS AO CARD DA EMPRESA */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <Paperclip size={14} className="text-blue-600" />
                        Arquivo Anexado ({comp.documents.length}):
                      </h4>

                      {comp.documents.length === 0 ? (
                        <div className="bg-slate-50 p-3 rounded-lg text-center text-slate-400 text-[11px] border border-dashed">
                          Nenhum arquivo anexado ainda neste card.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {comp.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50/50 border border-slate-200 transition"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2 overflow-hidden">
                                {getDocIcon(doc.fileType)}
                                <div className="min-w-0 flex-1">
                                  <span className="font-bold text-slate-800 text-xs block truncate" title={doc.title}>
                                    {doc.title}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block truncate">{doc.fileSize || doc.fileType}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  onClick={() => handleDownloadFile(doc)}
                                  className="text-xs font-bold text-slate-900 bg-white border border-slate-300 hover:bg-slate-900 hover:text-white px-3 py-1.5 rounded-lg transition flex items-center gap-1 shadow-sm"
                                >
                                  <Download size={13} />
                                  Baixar PDF
                                </button>

                                {isAdmin && (
                                  <button
                                    onClick={() => handleDeleteAttachedDoc(comp.id, doc.id, false)}
                                    title="Remover arquivo"
                                    className="text-slate-400 hover:text-red-600 p-1.5 rounded transition"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>

                  {comp.copyContent && (
                    <CardFooter className="pt-3 border-t bg-slate-50/50 justify-between items-center text-xs">
                      <span className="text-slate-400 text-[11px]">Sal Vita Oficial</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyText(comp.copyContent, comp.id)}
                        className="text-xs gap-1"
                      >
                        {copiedId === comp.id ? <Check size={14} /> : <Copy size={14} />}
                        Copiar Dados Texto
                      </Button>
                    </CardFooter>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL ADMIN: ALTERAR FOTO DO PRODUTO (LOCAL FILE OU URL) */}
      {editImageModalOpen && editingProduct && (
        <Dialog open={editImageModalOpen} onOpenChange={setEditImageModalOpen}>
          <DialogContent className="max-w-md w-full">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Camera size={20} className="text-amber-500" />
                Alterar Foto do Produto
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Selecione a foto do produto <strong className="text-slate-800">{editingProduct.name}</strong> diretamente do seu computador.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveProductImage} className="space-y-4 py-2 text-xs md:text-sm">
              {/* Native Computer File Picker */}
              <div>
                <label className="block font-semibold mb-1.5 text-slate-800">Escolher Imagem do Computador (PNG/JPG)</label>
                <input
                  type="file"
                  ref={photoInputRef}
                  onChange={handleLocalPhotoUpload}
                  accept="image/png, image/jpeg, image/jpg, image/webp"
                  className="hidden"
                />
                <Button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  variant="outline"
                  className="w-full h-12 bg-slate-50 hover:bg-slate-100 border-dashed border-2 border-slate-300 font-bold text-slate-700 flex items-center justify-center gap-2 text-xs"
                >
                  <Upload size={16} className="text-blue-600 shrink-0" />
                  <span>Selecionar Foto do Computador...</span>
                </Button>
              </div>

              {/* Optional URL Input */}
              <div>
                <label className="block font-semibold mb-1 text-slate-700 text-xs">Ou insira o Link/URL da Imagem</label>
                <Input
                  type="text"
                  placeholder="https://exemplo.com/foto.png"
                  value={imageUrlInput}
                  onChange={e => setImageUrlInput(e.target.value)}
                  className="text-xs text-slate-900 bg-white"
                />
              </div>

              {/* Preview */}
              {imageUrlInput.trim() && (
                <div className="bg-slate-100 p-3 rounded-xl border text-center space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 block uppercase">Pré-visualização da Foto</span>
                  <div className="h-32 flex items-center justify-center overflow-hidden">
                    <img 
                      src={imageUrlInput.trim()} 
                      alt="Pré-visualização" 
                      className="max-h-full max-w-full object-contain rounded"
                      onError={() => toast.error("Erro ao carregar pré-visualização da imagem.")}
                    />
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2 pt-2 justify-between flex-row sm:justify-between">
                {editingProduct.imageUrl ? (
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleResetProductImage}
                    className="text-xs text-slate-600 gap-1"
                  >
                    <RotateCcw size={13} /> Restaurar Padrão
                  </Button>
                ) : <div />}

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditImageModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                    Salvar Foto
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL ADMIN: INSERIR ARQUIVO DO COMPUTADOR NO CARD (CORRIGIDO SEM BUG VISUAL) */}
      {attachModalOpen && (
        <Dialog open={attachModalOpen} onOpenChange={setAttachModalOpen}>
          <DialogContent className="max-w-md w-full overflow-hidden">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Paperclip size={20} className="text-emerald-600" />
                Inserir Arquivo do Computador no Card
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Escolha o arquivo PDF ou laudo no seu computador para este card.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveAttachedDoc} className="space-y-4 py-2 text-xs md:text-sm">
              {/* Native File Input Picker */}
              <div>
                <label className="block font-semibold mb-1.5 text-slate-800">Escolher Arquivo do Computador (PDF/Laudo) *</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLocalFileUpload}
                  accept=".pdf, .doc, .docx, .png, .jpg, .jpeg"
                  className="hidden"
                />
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[48px] h-auto py-2 px-3 bg-emerald-50 hover:bg-emerald-100 border-2 border-dashed border-emerald-300 text-emerald-900 font-bold flex items-center justify-center gap-2 text-xs shadow-sm max-w-full overflow-hidden"
                >
                  <FolderPlus size={18} className="text-emerald-600 shrink-0" />
                  <span className="truncate max-w-full">
                    {newDocData.fileName ? `Substituir: ${newDocData.fileName}` : "Selecionar Arquivo do Seu Computador..."}
                  </span>
                </Button>
              </div>

              {/* Title of document */}
              <div>
                <label className="block font-semibold mb-1 text-slate-800">Título / Nome de Exibição do Arquivo *</label>
                <Input
                  type="text"
                  placeholder="Ex: FICHA TECNICA SAL GRANULADO COM IODO"
                  value={newDocData.title}
                  onChange={e => setNewDocData({ ...newDocData, title: e.target.value })}
                  className="text-xs text-slate-900 bg-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Tipo de Documento</label>
                  <select
                    value={newDocData.fileType}
                    onChange={e => setNewDocData({ ...newDocData, fileType: e.target.value as any })}
                    className="w-full px-3 py-2 border rounded-md text-xs bg-white text-slate-900"
                  >
                    <option value="PDF">Ficha Técnica / PDF</option>
                    <option value="LAUDO">Laudo de Análise</option>
                    <option value="CERTIFICADO">Certificado MAPA / ANVISA</option>
                    <option value="IMAGEM">Imagem / Foto</option>
                    <option value="OUTRO">Outro Documento</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-800">Tamanho / Detalhe</label>
                  <Input
                    type="text"
                    placeholder="Ex: PDF • 786 KB"
                    value={newDocData.fileSize}
                    onChange={e => setNewDocData({ ...newDocData, fileSize: e.target.value })}
                    className="text-xs text-slate-900 bg-white"
                  />
                </div>
              </div>

              {/* Status File Confirmation */}
              {newDocData.fileUrl && newDocData.fileUrl !== "#" && (
                <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 flex items-center gap-2 text-emerald-800 text-xs font-semibold max-w-full overflow-hidden">
                  <Check size={16} className="text-emerald-600 shrink-0" />
                  <span className="truncate max-w-full">
                    Arquivo pronto: {newDocData.fileName || "Carregado"}
                  </span>
                </div>
              )}

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setAttachModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                  Inserir Arquivo no Card
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

              {/* Documentos Anexados */}
              {selectedProduct.documents.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-1.5">
                    <Paperclip size={16} className="text-emerald-600" />
                    Arquivo Anexado a este Produto:
                  </h4>
                  <div className="space-y-2">
                    {selectedProduct.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border">
                        <div className="flex items-center gap-2 overflow-hidden">
                          {getDocIcon(doc.fileType)}
                          <span className="font-semibold text-xs text-slate-800 truncate">{doc.title}</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleDownloadFile(doc)}
                          className="text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                        >
                          <Download size={13} /> Baixar
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
