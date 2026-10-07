import { useState, useEffect, useRef, useMemo } from "react";
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
  Eye,
  Layers,
  ShoppingCart,
  Plus,
  Trash2,
  Paperclip,
  FilePlus,
  FileCheck,
  Microscope,
  FileSpreadsheet,
  Camera,
  RotateCcw,
  Upload,
  FolderPlus
} from "lucide-react";
import { Page, PageHeader, Panel, PanelHeader, EmptyState } from "../components/layout/Page";
import { Skeleton } from "../components/ui/skeleton";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import { useConfirm } from "../components/useConfirm";
import { QueryError } from "../components/QueryError";

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
  imageUrl?: string;
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

// ============================================================================
// Leitura do IndexedDB legado — usada SÓ para migrar, uma vez, o que ficou
// preso no navegador antes de a página passar a salvar no servidor.
// A fonte da verdade agora é o banco (router `catalog`).
// ============================================================================
const LOCAL_MIGRATION_FLAG = "sal_vita_docs_migrated_to_server";
// Espelha o limite do backend (server/routers/catalog.ts): o corpo aceito pelo
// Express e de 4mb e o base64 infla ~33%.
const MAX_UPLOAD_BYTES = 2.5 * 1024 * 1024;
const DB_NAME = "SalVitaMasterStorageDB_v6";
const DB_VERSION = 1;
const STORE_PRODUCTS = "products_master";
const STORE_COMPANY = "company_master";

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject("IndexedDB is unavailable in this browser environment.");
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        db.createObjectStore(STORE_PRODUCTS);
      }
      if (!db.objectStoreNames.contains(STORE_COMPANY)) {
        db.createObjectStore(STORE_COMPANY);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const idbGetMaster = async (storeName: string, key: string): Promise<any> => {
  try {
    const db = await getDB();
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`[Sal Vita DB Error] Failed to read "${key}":`, err);
    return null;
  }
};

// CANVAS IMAGE COMPRESSOR - CONVERTS MASSIVE IMAGES (5MB+) TO COMPACT WEB-READY DATA URL (~80KB)
const compressImageFile = (file: File, maxWidth = 900, maxHeight = 900, quality = 0.85): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL("image/webp", quality) || canvas.toDataURL("image/jpeg", quality);
        resolve(compressedDataUrl);
      };
      img.onerror = () => resolve(event.target?.result as string);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
};

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
      weight: "",
      granulometry: "",
      solubility: "",
      purity: "",
      storage: ""
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
      weight: "",
      granulometry: "",
      solubility: "",
      purity: "",
      storage: ""
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
      weight: "",
      granulometry: "",
      solubility: "",
      purity: "",
      storage: ""
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
      weight: "",
      granulometry: "",
      solubility: "",
      purity: "",
      storage: ""
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
      weight: "",
      granulometry: "",
      solubility: "",
      purity: "",
      storage: ""
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
      weight: "",
      granulometry: "",
      solubility: "",
      purity: "",
      storage: ""
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
      weight: "",
      granulometry: "",
      solubility: "",
      purity: "",
      storage: ""
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
      weight: "",
      granulometry: "",
      solubility: "",
      purity: "",
      storage: ""
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
  const { confirm, confirmDialog } = useConfirm();
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  const [activeTab, setActiveTab] = useState<"produtos" | "empresa">("produtos");
  const [categoryFilter, setCategoryFilter] = useState<string>("todos");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<TechnicalProduct | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Hidden File Inputs for native computer upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // ── Persistência no SERVIDOR ───────────────────────────────────────────────
  // Antes isto vivia no IndexedDB do navegador, então cada pessoa via só os
  // próprios arquivos. Agora o catálogo é uma constante local (produtos/cards)
  // e os anexos + fotos vêm do banco, iguais para todo mundo.
  const utils = trpc.useUtils();
  const { data: catalog, isLoading: catalogLoading, isError: catalogError, isFetching: catalogFetching, refetch: refetchCatalog } = trpc.catalog.list.useQuery();
  const addDocMutation = trpc.catalog.addDocument.useMutation();
  const deleteDocMutation = trpc.catalog.deleteDocument.useMutation();
  const setImageMutation = trpc.catalog.setImage.useMutation();
  const setSpecsMutation = trpc.catalog.setSpecs.useMutation();
  const resetImageMutation = trpc.catalog.resetImage.useMutation();
  const migrateMutation = trpc.catalog.migrateFromLocal.useMutation();

  const docsByOwner = useMemo(() => {
    const map = new Map<string, AttachedDoc[]>();
    for (const d of catalog?.documents ?? []) {
      const key = `${d.ownerType}:${d.ownerId}`;
      const list = map.get(key) ?? [];
      list.push({
        id: String(d.id),
        title: d.title,
        fileUrl: "",                      // binário é buscado sob demanda
        fileName: d.fileName ?? undefined,
        fileType: (d.fileType as AttachedDoc["fileType"]) ?? "PDF",
        fileSize: d.fileSize ?? undefined,
        addedAt: d.uploadedByName ?? undefined,
      });
      map.set(key, list);
    }
    return map;
  }, [catalog]);

  const specsByOwner = useMemo(() => {
    const map = new Map<string, TechnicalProduct["specs"]>();
    for (const sp of catalog?.specs ?? []) {
      map.set(sp.ownerId, {
        weight: sp.weight ?? "",
        granulometry: sp.granulometry ?? "",
        solubility: sp.solubility ?? "",
        purity: sp.purity ?? "",
        storage: sp.storage ?? "",
      });
    }
    return map;
  }, [catalog]);

  const imagesByOwner = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of catalog?.images ?? []) map.set(i.ownerId, i.imageUrl);
    return map;
  }, [catalog]);

  const productsList = useMemo<TechnicalProduct[]>(
    () => INITIAL_PRODUCTS.map(p => ({
      ...p,
      imageUrl: imagesByOwner.get(p.id) ?? p.imageUrl,
      specs: specsByOwner.get(p.id) ?? p.specs,
      documents: docsByOwner.get(`product:${p.id}`) ?? [],
    })),
    [docsByOwner, imagesByOwner, specsByOwner],
  );

  const companyCategoriesList = useMemo<CompanyCategory[]>(
    () => INITIAL_COMPANY_CATEGORIES.map(c => ({
      ...c,
      documents: docsByOwner.get(`company:${c.id}`) ?? [],
    })),
    [docsByOwner],
  );

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
  const [specsModalOpen, setSpecsModalOpen] = useState<boolean>(false);
  const [specsProduct, setSpecsProduct] = useState<TechnicalProduct | null>(null);
  const [specsForm, setSpecsForm] = useState({ weight: "", granulometry: "", solubility: "", purity: "", storage: "" });

  const [editImageModalOpen, setEditImageModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<TechnicalProduct | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState<string>("");
  const [isCompressingPhoto, setIsCompressingPhoto] = useState<boolean>(false);


  // Migração única: sobe para o servidor o que ficou preso no IndexedDB /
  // localStorage deste navegador (arquivos enviados antes desta correção),
  // para nada se perder. Roda uma vez por navegador e é idempotente no backend.
  useEffect(() => {
    if (!isAdmin || catalogLoading) return;
    if (localStorage.getItem(LOCAL_MIGRATION_FLAG) === "done") return;

    const migrate = async () => {
      try {
        const docs: any[] = [];
        const images: any[] = [];

        const collect = (arr: any[], ownerType: "product" | "company") => {
          if (!Array.isArray(arr)) return;
          for (const item of arr) {
            if (!item?.id) continue;
            if (ownerType === "product" && typeof item.imageUrl === "string" && item.imageUrl.startsWith("data:")) {
              images.push({ ownerId: item.id, imageUrl: item.imageUrl });
            }
            for (const d of item.documents ?? []) {
              if (typeof d?.fileUrl === "string" && d.fileUrl.startsWith("data:")) {
                docs.push({
                  ownerType, ownerId: item.id, title: d.title ?? "Documento",
                  fileName: d.fileName, fileType: d.fileType ?? "PDF",
                  fileSize: d.fileSize, content: d.fileUrl,
                });
              }
            }
          }
        };

        collect(await idbGetMaster(STORE_PRODUCTS, "sal_vita_products_master"), "product");
        collect(await idbGetMaster(STORE_COMPANY, "sal_vita_company_master"), "company");

        for (const key of ["sal_vita_products_v5", "sal_vita_products_v4", "sal_vita_products_v3", "sal_vita_products_v2", "sal_vita_products"]) {
          try { collect(JSON.parse(localStorage.getItem(key) || "null"), "product"); } catch {}
        }
        for (const key of ["sal_vita_company_v5", "sal_vita_company_v4", "sal_vita_company_v3", "sal_vita_company_v2", "sal_vita_company"]) {
          try { collect(JSON.parse(localStorage.getItem(key) || "null"), "company"); } catch {}
        }

        if (docs.length === 0 && images.length === 0) {
          localStorage.setItem(LOCAL_MIGRATION_FLAG, "done");
          return;
        }

        const res = await migrateMutation.mutateAsync({ documents: docs.slice(0, 100), images: images.slice(0, 60) });
        localStorage.setItem(LOCAL_MIGRATION_FLAG, "done");
        if (res.docsImported > 0 || res.imagesImported > 0) {
          toast.success(`Enviamos para o servidor ${res.docsImported} arquivo(s) e ${res.imagesImported} foto(s) que estavam salvos só neste navegador.`);
          utils.catalog.list.invalidate();
        }
      } catch (err) {
        console.error("[Documentos] migração local → servidor falhou:", err);
      }
    };

    migrate();
  }, [isAdmin, catalogLoading]);

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

  // NATIVE FILE SELECTOR FROM COMPUTER FOR ATTACHMENTS
  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    const sizeStr = file.size > 1024 * 1024 ? `${sizeMb} MB` : `${Math.round(file.size / 1024)} KB`;
    const ext = file.name.split('.').pop()?.toUpperCase() || 'ARQUIVO';

    // Avisa aqui em vez de deixar o servidor recusar depois de todo o upload.
    // O limite acompanha o do backend (2,5 MB — ver server/routers/catalog.ts).
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`"${file.name}" tem ${sizeMb} MB. O limite é 2,5 MB — comprima o PDF e tente de novo.`);
      e.target.value = "";
      return;
    }

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
    reader.onerror = () => {
      toast.error(`Não foi possível ler "${file.name}". Tente novamente ou escolha outro arquivo.`);
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  // COMPRESSED PHOTO SELECTOR FROM COMPUTER FOR PRODUCT CARD
  const handleLocalPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressingPhoto(true);
    try {
      const compressedDataUrl = await compressImageFile(file, 900, 900, 0.85);
      setImageUrlInput(compressedDataUrl);
      toast.success(`Foto "${file.name}" otimizada e pronta para salvar!`);
    } catch (err) {
      console.error("Error compressing photo:", err);
      toast.error("Erro ao processar imagem.");
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  const handleOpenSpecsModal = (product: TechnicalProduct) => {
    setSpecsProduct(product);
    setSpecsForm({
      weight: product.specs.weight ?? "",
      granulometry: product.specs.granulometry ?? "",
      solubility: product.specs.solubility ?? "",
      purity: product.specs.purity ?? "",
      storage: product.specs.storage ?? "",
    });
    setSpecsModalOpen(true);
  };

  const handleSaveSpecs = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (!specsProduct) return;
    try {
      await setSpecsMutation.mutateAsync({ ownerId: specsProduct.id, ...specsForm });
      await utils.catalog.list.invalidate();
      toast.success("Especificações salvas — agora valem para toda a equipe.");
      setSpecsModalOpen(false);
      setSpecsProduct(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao salvar as especificações.");
    }
  };

  const handleOpenImageModal = (product: TechnicalProduct) => {
    setEditingProduct(product);
    setImageUrlInput(product.imageUrl || "");
    setEditImageModalOpen(true);
  };

  const handleSaveProductImage = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();

    if (!editingProduct) {
      setEditImageModalOpen(false);
      return;
    }

    const productId = editingProduct.id;
    const finalPhoto = imageUrlInput.trim();

    try {
      if (finalPhoto) {
        await setImageMutation.mutateAsync({ ownerId: productId, imageUrl: finalPhoto });
      } else {
        await resetImageMutation.mutateAsync({ ownerId: productId });
      }
      await utils.catalog.list.invalidate();
      toast.success("Foto salva no servidor — toda a equipe passa a ver.");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao salvar a foto.");
      return;
    }

    setEditingProduct(null);
    setImageUrlInput("");
    setEditImageModalOpen(false);
  };

  const handleResetProductImage = async () => {
    if (!editingProduct) return;
    const productId = editingProduct.id;

    try {
      await resetImageMutation.mutateAsync({ ownerId: productId });
      await utils.catalog.list.invalidate();
      toast.success("Foto restaurada para a ilustração padrão.");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao restaurar a foto.");
      return;
    }

    setEditingProduct(null);
    setImageUrlInput("");
    setEditImageModalOpen(false);
  };

  const handleSaveAttachedDoc = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();

    if (!newDocData.title.trim()) {
      toast.error("Preencha o título do documento.");
      return;
    }

    if (!newDocData.fileUrl || newDocData.fileUrl === "#") {
      toast.error("Por favor, selecione um arquivo do aparelho.");
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

    if (!targetTargetId) return;
    try {
      await addDocMutation.mutateAsync({
        ownerType: targetType,
        ownerId: targetTargetId,
        title: docToAdd.title,
        fileName: docToAdd.fileName,
        fileType: docToAdd.fileType,
        fileSize: docToAdd.fileSize,
        content: newDocData.fileUrl,
      });
      await utils.catalog.list.invalidate();
      toast.success("Arquivo anexado e disponível para toda a equipe.");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao anexar arquivo.");
      return;
    }

    setAttachModalOpen(false);
    setTargetTargetId(null);
    setNewDocData({
      title: "",
      fileUrl: "",
      fileName: "",
      fileType: "PDF",
      fileSize: "",
    });
  };

  // A listagem traz só metadados; o binário é buscado agora, no clique — assim
  // abrir a página não baixa todos os anexos de uma vez.
  const handleDownloadFile = async (doc: AttachedDoc) => {
    try {
      const full = await utils.catalog.getContent.fetch({ id: Number(doc.id) });
      if (!full?.content) {
        toast.error("Arquivo indisponível.");
        return;
      }
      const link = document.createElement("a");
      link.href = full.content;
      link.download = full.fileName || doc.fileName || `${doc.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Download de "${full.fileName || doc.title}" iniciado!`);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao baixar o arquivo.");
    }
  };

  const handleDeleteAttachedDoc = async (_cardId: string, docId: string, _isProduct: boolean) => {
    if (!(await confirm("Remover este arquivo anexado do card? Ele sai para toda a equipe.", { confirmLabel: "Remover" }))) return;
    try {
      await deleteDocMutation.mutateAsync({ id: Number(docId) });
      await utils.catalog.list.invalidate();
      toast.success("Arquivo removido.");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao remover o arquivo.");
    }
  };

  const handleCopyWhatsApp = (product: TechnicalProduct) => {
    const docsListText = product.documents.length > 0 
      ? product.documents.map(d => `📄 ${d.title}`).join('\n')
      : "📄 Ficha Técnica Sob Consulta";

    // Só entra no texto o que o admin preencheu de verdade. Antes as
    // especificações eram valores inventados e iam assim mesmo para o cliente —
    // para sal alimentício, pureza/granulometria são declaração regulada.
    const specsText = [
      ['🔬 *Granulometria:*', product.specs.granulometry],
      ['💧 *Solubilidade:*', product.specs.solubility],
      ['⭐ *Pureza:*', product.specs.purity],
      ['🏷️ *Armazenamento:*', product.specs.storage],
    ]
      .filter(([, v]) => (v ?? '').trim().length > 0)
      .map(([label, v]) => `\n${label} ${v}`)
      .join('');

    const text = `📌 *FICHA TÉCNICA - ${product.name.toUpperCase()}* (${product.subTitle || product.packageType})

✨ *Aplicações Principais:*
${product.applications.map(a => `• ${a}`).join('\n')}

📦 *Embalagem:* ${product.packageType}
🔹 *Marcas:* ${product.brands.join(' / ')}
🔹 *Opções de Iodo:* ${product.iodineOptions}${specsText}

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

  // Nunca renderiza célula vazia como se fosse um dado: ou tem o valor real
  // que o admin preencheu, ou diz explicitamente que não foi informado.
  const specValue = (v?: string) =>
    (v ?? "").trim().length > 0
      ? <>{v}</>
      : <span className="text-slate-500 italic">não informado</span>;

  const hasAnySpec = (p: TechnicalProduct) =>
    Object.values(p.specs).some(v => (v ?? "").trim().length > 0);

  // Ícone neutro: o tipo do arquivo já aparece no título/tamanho, cor não carrega informação.
  const getDocIcon = (type: string) => {
    switch (type) {
      case "LAUDO":
        return <Microscope aria-hidden="true" size={16} className="text-slate-500 flex-shrink-0" />;
      case "CERTIFICADO":
        return <FileCheck aria-hidden="true" size={16} className="text-slate-500 flex-shrink-0" />;
      case "IMAGEM":
        return <FileSpreadsheet aria-hidden="true" size={16} className="text-slate-500 flex-shrink-0" />;
      default:
        return <FileText aria-hidden="true" size={16} className="text-slate-500 flex-shrink-0" />;
    }
  };

  // Miniatura do produto: a foto cadastrada ou um ícone neutro da linha de embalagem.
  const renderProductThumb = (product: TechnicalProduct) => {
    if (product.imageUrl) {
      return (
        <div className="size-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-1">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="size-full object-contain"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>
      );
    }
    const Icon = product.iconType === "bigbag" ? Package : product.iconType === "sacaria" ? Layers : ShoppingCart;
    return (
      <div aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500">
        <Icon size={24} />
      </div>
    );
  };

  const renderDocRow = (doc: AttachedDoc, ownerId: string, isProduct: boolean, downloadLabel: string) => (
    <li key={doc.id} className="flex items-start justify-between gap-2 py-2">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <span className="mt-0.5 shrink-0">{getDocIcon(doc.fileType)}</span>
        <div className="min-w-0 flex-1">
          {/* Título sempre inteiro, sem truncar */}
          <span className="block break-words whitespace-normal text-xs font-medium leading-snug text-slate-900">
            {doc.title}
          </span>
          {doc.fileSize && (
            <span className="mt-0.5 block text-xs text-slate-500">{doc.fileSize}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="outline" size="sm" onClick={() => handleDownloadFile(doc)} title="Baixar arquivo">
          <Download aria-hidden="true" /> {downloadLabel}
        </Button>
        {isAdmin && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => handleDeleteAttachedDoc(ownerId, doc.id, isProduct)}
            title="Remover anexo"
            aria-label="Remover anexo"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        )}
      </div>
    </li>
  );

  return (
    <Page>
      {confirmDialog}
      <PageHeader
        title="Documentos & Fichas Técnicas"
        description="Fichas dos produtos e documentos da empresa para enviar a clientes. Anexe os arquivos direto no card de cada item."
      />

      {/* Abas + busca */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "produtos" | "empresa")} className="shrink-0">
          <TabsList>
            <TabsTrigger value="produtos">
              <Package aria-hidden="true" /> Produtos ({productsList.length})
            </TabsTrigger>
            <TabsTrigger value="empresa">
              <Building2 aria-hidden="true" /> Documentos da empresa ({companyCategoriesList.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1 lg:max-w-md">
          <Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            aria-label="Buscar documentos"
            placeholder={activeTab === "produtos" ? "Buscar por produto, laudo, aplicação..." : "Buscar por CNPJ, alvará, licença..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9"
          />
        </div>
      </div>

      {/* Anexos vêm do servidor: avisa enquanto carregam, para os cards não
          parecerem vazios por um instante. */}
      {catalogLoading && (
        <div className="flex items-center gap-3" role="status">
          <Skeleton className="h-3 w-40" />
          <span className="text-xs text-slate-500">Carregando anexos do servidor...</span>
        </div>
      )}
      {catalogError && !catalog && (
        <QueryError message="Não foi possível carregar os anexos do servidor" onRetry={() => void refetchCatalog()} retrying={catalogFetching} />
      )}

      {/* Filtro de categoria (só produtos) */}
      {activeTab === "produtos" && (
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "todos", label: "Todos" },
            { id: "bigbag", label: "Big Bags (1.000 KG)" },
            { id: "sacaria", label: "Sacarias (25 KG)" },
            { id: "varejo", label: "Linha Varejo (1 KG)" },
          ].map((cat) => (
            <Button
              key={cat.id}
              type="button"
              size="sm"
              variant={categoryFilter === cat.id ? "default" : "outline"}
              aria-pressed={categoryFilter === cat.id}
              onClick={() => setCategoryFilter(cat.id)}
            >
              {cat.label}
            </Button>
          ))}
        </div>
      )}

      {/* ABA 1: PRODUTOS */}
      {activeTab === "produtos" && (
        <>
          {filteredProducts.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<Package />}
                title={searchQuery ? `Nenhum produto encontrado para "${searchQuery}"` : "Nenhum produto nesta categoria"}
                description="Ajuste a busca ou volte para todos os produtos."
                action={
                  <Button variant="outline" size="sm" onClick={() => { setSearchQuery(""); setCategoryFilter("todos"); }}>
                    Limpar filtros
                  </Button>
                }
              />
            </Panel>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <Panel key={product.id} as="article" className="flex flex-col">
                  <div className="flex items-start gap-3 border-b border-slate-200 p-4">
                    {renderProductThumb(product)}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold leading-tight text-slate-900">{product.name}</h2>
                      {product.subTitle && <p className="mt-0.5 text-xs text-slate-500">{product.subTitle}</p>}
                      <Badge variant="neutral" className="mt-2">{product.packageType}</Badge>
                    </div>
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleOpenImageModal(product)}
                        title="Alterar foto"
                        aria-label={`Alterar foto de ${product.name}`}
                      >
                        <Camera aria-hidden="true" />
                      </Button>
                    )}
                  </div>

                  <div className="flex-1 space-y-4 p-4 text-xs">
                    <dl className="space-y-1 text-slate-700">
                      <div className="flex gap-1.5">
                        <dt className="font-medium text-slate-500">Marcas:</dt>
                        <dd className="text-slate-900">{product.brands.join(", ")}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="font-medium text-slate-500">Iodo:</dt>
                        <dd className="text-slate-900">{product.iodineOptions}</dd>
                      </div>
                    </dl>

                    <div>
                      <h3 className="mb-1.5 text-xs font-semibold text-slate-900">Aplicações recomendadas</h3>
                      <ul className="space-y-1 text-slate-700">
                        {product.applications.map((app, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-400" />
                            <span>{app}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="border-t border-slate-200 pt-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                          <Paperclip aria-hidden="true" size={14} className="text-slate-500" />
                          Anexos ({product.documents.length})
                        </h3>
                        {isAdmin && (
                          <Button type="button" variant="outline" size="sm" onClick={() => handleOpenAttachModal(product.id, "product")}>
                            <Plus aria-hidden="true" /> Anexar
                          </Button>
                        )}
                      </div>

                      {product.documents.length === 0 ? (
                        <p className="py-2 text-xs text-slate-500">Nenhum arquivo anexado neste produto.</p>
                      ) : (
                        <ul className="divide-y divide-slate-200">
                          {product.documents.map((doc) => renderDocRow(doc, product.id, true, "Baixar"))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 border-t border-slate-200 bg-slate-50 p-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => setSelectedProduct(product)} className="flex-1">
                      <Eye aria-hidden="true" /> Ver ficha
                    </Button>
                    <Button type="button" size="sm" onClick={() => handleCopyWhatsApp(product)} className="flex-1">
                      {copiedId === product.id ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
                      {copiedId === product.id ? "Copiado" : "WhatsApp"}
                    </Button>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </>
      )}

      {/* ABA 2: EMPRESA */}
      {activeTab === "empresa" && (
        <>
          {filteredCompanyCategories.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<Building2 />}
                title="Nenhum documento da empresa encontrado"
                description="Ajuste a busca para ver os cards cadastrais."
                action={searchQuery ? <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>Limpar busca</Button> : undefined}
              />
            </Panel>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredCompanyCategories.map((comp) => (
                <Panel key={comp.id} as="article" className="flex flex-col">
                  <PanelHeader
                    title={comp.title}
                    description={comp.categoryLabel}
                    actions={isAdmin ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => handleOpenAttachModal(comp.id, "company")}>
                        <Plus aria-hidden="true" /> Anexar
                      </Button>
                    ) : undefined}
                  />

                  <div className="flex-1 space-y-4 p-4 text-xs">
                    <p className="text-slate-700">{comp.description}</p>

                    {comp.details && comp.details.length > 0 && (
                      <ul className="space-y-1.5 rounded-md bg-slate-50 p-3 text-slate-700">
                        {comp.details.map((detail, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <ShieldCheck aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-slate-500" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="border-t border-slate-200 pt-3">
                      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                        <Paperclip aria-hidden="true" size={14} className="text-slate-500" />
                        Anexos ({comp.documents.length})
                      </h3>

                      {comp.documents.length === 0 ? (
                        <p className="py-2 text-xs text-slate-500">Nenhum arquivo anexado neste card.</p>
                      ) : (
                        <ul className="divide-y divide-slate-200">
                          {comp.documents.map((doc) => renderDocRow(doc, comp.id, false, "Baixar PDF"))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {comp.copyContent && (
                    <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 p-3">
                      <Button type="button" size="sm" variant="outline" onClick={() => handleCopyText(comp.copyContent, comp.id)}>
                        {copiedId === comp.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                        Copiar dados
                      </Button>
                    </div>
                  )}
                </Panel>
              ))}
            </div>
          )}
        </>
      )}

      {/* MODAL ADMIN: ESPECIFICAÇÕES TÉCNICAS REAIS */}
      {specsModalOpen && specsProduct && (
        <Dialog open={specsModalOpen} onOpenChange={(open) => { setSpecsModalOpen(open); if (!open) setSpecsProduct(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Especificações — {specsProduct.name}</DialogTitle>
              <DialogDescription className="text-xs">
                Preencha com os dados do laudo. O que ficar em branco aparece como
                "não informado" e é omitido da ficha enviada ao cliente.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveSpecs} className="space-y-4">
              {([
                ['weight', 'Embalagem', 'Ex: 25 KG (saco de polietileno)'],
                ['granulometry', 'Granulometria', 'Ex: fina e uniforme'],
                ['solubility', 'Solubilidade', 'Ex: rápida'],
                ['purity', 'Pureza / NaCl', 'Copie exatamente o valor do laudo'],
                ['storage', 'Armazenamento', 'Ex: local seco, sobre estrados'],
              ] as const).map(([field, label, placeholder]) => (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={`spec-${field}`}>{label}</Label>
                  <Input
                    id={`spec-${field}`}
                    value={specsForm[field]}
                    onChange={(e) => setSpecsForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder={placeholder}
                  />
                </div>
              ))}
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                Pureza e granulometria são declarações reguladas para sal alimentício.
                Informe só o que constar no laudo — não estime.
              </p>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setSpecsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={setSpecsMutation.isPending}>
                  {setSpecsMutation.isPending ? "Salvando..." : "Salvar especificações"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL ADMIN: ALTERAR FOTO DO PRODUTO */}
      {editImageModalOpen && editingProduct && (
        <Dialog open={editImageModalOpen} onOpenChange={(open) => {
          setEditImageModalOpen(open);
          if (!open) {
            setEditingProduct(null);
            setImageUrlInput("");
          }
        }}>
          <DialogContent className="max-w-md w-full">
            <DialogHeader>
              <DialogTitle>Alterar foto do produto</DialogTitle>
              <DialogDescription className="text-xs">
                Selecione a foto de <strong className="text-slate-900">{editingProduct.name}</strong> no seu aparelho.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-sm">
              <div className="space-y-1.5">
                <Label>Imagem do aparelho (PNG/JPG)</Label>
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
                  disabled={isCompressingPhoto}
                  variant="outline"
                  className="w-full"
                >
                  <Upload aria-hidden="true" />
                  <span>{isCompressingPhoto ? "Otimizando imagem..." : "Selecionar foto"}</span>
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="photo-url">Ou informe o link da imagem</Label>
                <Input
                  id="photo-url"
                  type="text"
                  placeholder="https://exemplo.com/foto.png"
                  value={imageUrlInput}
                  onChange={e => setImageUrlInput(e.target.value)}
                />
              </div>

              {imageUrlInput.trim() && (
                <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-center">
                  <span className="block text-xs font-medium text-slate-500">Pré-visualização</span>
                  <div className="flex h-36 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white p-2">
                    <img
                      src={imageUrlInput.trim()}
                      alt="Pré-visualização"
                      className="max-h-full max-w-full rounded object-contain"
                      onError={() => toast.error("Erro ao carregar pré-visualização da imagem.")}
                    />
                  </div>
                </div>
              )}

              <DialogFooter className="flex-row justify-between gap-2 pt-2 sm:justify-between">
                {editingProduct.imageUrl ? (
                  <Button type="button" variant="outline" onClick={handleResetProductImage}>
                    <RotateCcw aria-hidden="true" /> Restaurar padrão
                  </Button>
                ) : <div />}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditImageModalOpen(false);
                      setEditingProduct(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="button" onClick={handleSaveProductImage} disabled={isCompressingPhoto}>
                    Salvar foto
                  </Button>
                </div>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL ADMIN: ANEXAR ARQUIVO AO CARD */}
      {attachModalOpen && (
        <Dialog open={attachModalOpen} onOpenChange={(open) => {
          setAttachModalOpen(open);
          if (!open) setTargetTargetId(null);
        }}>
          <DialogContent className="max-w-md w-full overflow-hidden">
            <DialogHeader>
              <DialogTitle>Anexar arquivo ao card</DialogTitle>
              <DialogDescription className="text-xs">
                Escolha o PDF ou laudo no seu aparelho para este card.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-sm">
              <div className="space-y-1.5">
                <Label>Arquivo (PDF/Laudo) *</Label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLocalFileUpload}
                  accept=".pdf, .doc, .docx, .png, .jpg, .jpeg"
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-auto min-h-9 w-full max-w-full py-2"
                >
                  <FolderPlus aria-hidden="true" />
                  <span className="max-w-full truncate">
                    {newDocData.fileName ? `Substituir: ${newDocData.fileName}` : "Selecionar arquivo..."}
                  </span>
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="doc-title">Título de exibição *</Label>
                <Input
                  id="doc-title"
                  type="text"
                  placeholder="Ex: FICHA TECNICA SAL GRANULADO COM IODO"
                  value={newDocData.title}
                  onChange={e => setNewDocData({ ...newDocData, title: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="doc-type">Tipo de documento</Label>
                  <select
                    id="doc-type"
                    value={newDocData.fileType}
                    onChange={e => setNewDocData({ ...newDocData, fileType: e.target.value as any })}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 max-md:h-10"
                  >
                    <option value="PDF">Ficha Técnica / PDF</option>
                    <option value="LAUDO">Laudo de Análise</option>
                    <option value="CERTIFICADO">Certificado MAPA / ANVISA</option>
                    <option value="IMAGEM">Imagem / Foto</option>
                    <option value="OUTRO">Outro Documento</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="doc-size">Tamanho / detalhe</Label>
                  <Input
                    id="doc-size"
                    type="text"
                    placeholder="Ex: PDF • 786 KB"
                    value={newDocData.fileSize}
                    onChange={e => setNewDocData({ ...newDocData, fileSize: e.target.value })}
                  />
                </div>
              </div>

              {newDocData.fileUrl && newDocData.fileUrl !== "#" && (
                <div className="flex max-w-full items-center gap-2 overflow-hidden rounded-md bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                  <Check aria-hidden="true" size={16} className="shrink-0" />
                  <span className="max-w-full truncate">
                    Arquivo pronto: {newDocData.fileName || "Carregado"}
                  </span>
                </div>
              )}

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAttachModalOpen(false);
                    setTargetTargetId(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={handleSaveAttachedDoc}>
                  Anexar arquivo
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL FICHA TÉCNICA DETALHADA */}
      {selectedProduct && (
        <Dialog open={!!selectedProduct} onOpenChange={(open) => {
          if (!open) setSelectedProduct(null);
        }}>
          <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="neutral">{selectedProduct.packageType}</Badge>
                <span className="text-xs text-slate-500">{hasAnySpec(selectedProduct) ? "Especificação técnica" : "Ficha do produto"}</span>
              </div>
              <DialogTitle>{selectedProduct.name}</DialogTitle>
              <DialogDescription className="text-sm">
                {selectedProduct.subTitle}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-sm">
              <p className="rounded-md bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                {selectedProduct.description}
              </p>

              {/* Tabela de Especificações */}
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-900">Especificações técnicas</h4>
                  {isAdmin && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenSpecsModal(selectedProduct)}
                    >
                      <FilePlus aria-hidden="true" /> Preencher especificações
                    </Button>
                  )}
                </div>
                {!hasAnySpec(selectedProduct) && (
                  <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                    Nenhuma especificação foi informada para este produto ainda.
                    {isAdmin
                      ? " Preencha com os dados do laudo antes de enviar a ficha a um cliente."
                      : " Peça ao administrador para preencher com os dados do laudo."}
                  </p>
                )}
                <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 text-xs">
                  <div className="grid grid-cols-1 gap-0.5 bg-slate-50 px-3 py-2 font-medium text-slate-500 sm:grid-cols-3">
                    <span>Parâmetro</span>
                    <span className="sm:col-span-2">Especificação técnica</span>
                  </div>
                  <div className="grid grid-cols-1 gap-0.5 px-3 py-2.5 text-slate-900 sm:grid-cols-3">
                    <span className="font-medium text-slate-500">Embalagem</span>
                    <span className="sm:col-span-2">{specValue(selectedProduct.specs.weight)}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-0.5 px-3 py-2.5 text-slate-900 sm:grid-cols-3">
                    <span className="font-medium text-slate-500">Granulometria</span>
                    <span className="sm:col-span-2">{specValue(selectedProduct.specs.granulometry)}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-0.5 px-3 py-2.5 text-slate-900 sm:grid-cols-3">
                    <span className="font-medium text-slate-500">Solubilidade</span>
                    <span className="sm:col-span-2">{specValue(selectedProduct.specs.solubility)}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-0.5 px-3 py-2.5 text-slate-900 sm:grid-cols-3">
                    <span className="font-medium text-slate-500">Pureza / NaCl</span>
                    <span className="sm:col-span-2">{specValue(selectedProduct.specs.purity)}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-0.5 px-3 py-2.5 text-slate-900 sm:grid-cols-3">
                    <span className="font-medium text-slate-500">Armazenamento</span>
                    <span className="sm:col-span-2">{specValue(selectedProduct.specs.storage)}</span>
                  </div>
                </div>
              </div>

              {/* Documentos Anexados */}
              {selectedProduct.documents.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-slate-900">Anexos deste produto</h4>
                  <ul className="divide-y divide-slate-200">
                    {selectedProduct.documents.map((doc) => (
                      <li key={doc.id} className="flex items-start justify-between gap-2 py-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          <span className="mt-0.5 shrink-0">{getDocIcon(doc.fileType)}</span>
                          <span className="break-words whitespace-normal text-xs font-medium leading-snug text-slate-900">
                            {doc.title}
                          </span>
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => handleDownloadFile(doc)} className="shrink-0">
                          <Download aria-hidden="true" /> Baixar
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setSelectedProduct(null)}>
                Fechar
              </Button>
              <Button type="button" onClick={() => handleCopyWhatsApp(selectedProduct)}>
                <Share2 aria-hidden="true" />
                Copiar para WhatsApp
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Page>
  );
}
