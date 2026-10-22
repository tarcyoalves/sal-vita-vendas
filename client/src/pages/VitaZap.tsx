import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Page, PageHeader, Panel, PanelHeader } from "../components/layout/Page";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  ENDERECO_EXTENSOES,
  URL_INSTALADOR_VITA_ZAP,
  URL_VERSAO_VITA_ZAP,
  URL_ZIP_VITA_ZAP,
  ehChromeDeComputador,
  lerVersaoPublicada,
  montarStatus,
  perguntarExtensao,
  rotuloStatus,
  type PingVitaZap,
} from "../lib/vitaZap";

const PASTA_INSTALADOR = "%LOCALAPPDATA%\\VitaZap\\extensao";

function Codigo({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não consegui copiar. Selecione o texto e copie com Ctrl+C.");
    }
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 py-0.5 pl-2 pr-0.5 align-middle">
      <code className="truncate text-xs text-slate-800">{texto}</code>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Copiar ${texto}`} onClick={() => void copiar()}>
        {copiado ? <Check /> : <Copy />}
      </Button>
    </span>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{n}</span>
      <div className="min-w-0 space-y-2 text-sm text-slate-700">
        <p className="font-medium text-slate-900">{titulo}</p>
        {children}
      </div>
    </li>
  );
}

export default function VitaZap() {
  const chrome = typeof navigator !== "undefined" && ehChromeDeComputador(navigator.userAgent, typeof (globalThis as { chrome?: { runtime?: unknown } }).chrome?.runtime !== "undefined");
  const [ping, setPing] = useState<PingVitaZap | null | undefined>(undefined);
  const [versaoPublicada, setVersaoPublicada] = useState<string | null>(null);

  const verificar = useCallback(async () => {
    if (!chrome) return;
    setPing(await perguntarExtensao());
  }, [chrome]);

  // Arquivo estático (não toca o banco): a versão que o botão de baixar oferece.
  useEffect(() => {
    let vivo = true;
    fetch(URL_VERSAO_VITA_ZAP, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((corpo) => vivo && setVersaoPublicada(lerVersaoPublicada(corpo)))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  // Pergunta ao abrir e quando a aba volta a ter foco (depois de instalar no chrome://extensions). Sem polling.
  useEffect(() => {
    void verificar();
    const aoFocar = () => void verificar();
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
  }, [verificar]);

  const status = montarStatus({ chrome, ping, versaoPublicada });
  const tomStatus = status.tipo === "conectado" ? "success" : status.tipo === "falta-conectar" ? "warning" : status.tipo === "outro-navegador" ? "destructive" : "neutral";
  const versaoNova = (status.tipo === "conectado" || status.tipo === "falta-conectar") && status.atualizar;

  return (
    <Page>
      <PageHeader
        title="Vita Zap"
        description="O CRM dentro do WhatsApp Web: abas de triagem, lembretes e notas, ligados ao seu login do CRM. A extensão nunca envia mensagem sozinha; quem aperta Enter é você."
      />

      <Panel>
        <PanelHeader
          title="Situação neste computador"
          actions={
            chrome ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void verificar()}>
                <RefreshCw /> Verificar de novo
              </Button>
            ) : undefined
          }
        />
        <div className="space-y-2 px-4 py-3 text-sm text-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={tomStatus}>
              {status.tipo === "conectado" && <Check />}
              {rotuloStatus(status)}
            </Badge>
            {versaoNova && <Badge variant="info">Versão nova disponível (v{versaoPublicada})</Badge>}
          </div>
          {status.tipo === "outro-navegador" && (
            <p className="flex items-start gap-2 text-slate-700">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span>O Vita Zap só funciona no Google Chrome, no computador. Abra esta página no Chrome para instalar.</span>
            </p>
          )}
          {status.tipo === "nao-instalado" && (
            <p className="text-slate-500">
              Siga os passos abaixo. Se você já instalou uma versão anterior à 0.7.0 ela não responde a esta página: atualize pelo bloco "Atualizar".
            </p>
          )}
          {status.tipo === "falta-conectar" && (
            <p className="text-slate-500">Abra o WhatsApp Web e clique em "Conectar ao CRM" na barra do topo. Se você já está logado aqui no CRM, não pede senha.</p>
          )}
          {versaoNova && (
            <p className="text-slate-500">
              Você está na v{status.tipo === "conectado" || status.tipo === "falta-conectar" ? status.versao : ""}. Veja o bloco "Atualizar" mais abaixo.
            </p>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Instalar em 5 passos" description="Uma vez só por computador. O Chrome não deixa um site instalar a extensão sozinho; por isso o passo a passo." />
        <ol className="divide-y divide-slate-200">
          <Passo n={1} titulo="Baixe a extensão numa pasta fixa">
            <p>
              <b>Windows (recomendado):</b> baixe e rode o instalador (duplo clique, sem administrador). A pasta já fica em <Codigo texto={PASTA_INSTALADOR} /> e ele
              mantém a extensão atualizada. O Windows ou o Chrome podem avisar que o arquivo é pouco comum: escolha "Manter" e "Executar assim mesmo".
            </p>
            <Button asChild size="sm">
              <a href={URL_INSTALADOR_VITA_ZAP} download>
                <Download /> Baixar instalador (Windows)
              </a>
            </Button>
            <p>
              <b>Outra opção (manual):</b> baixe o zip e descompacte numa pasta <b>fixa</b>, por exemplo <Codigo texto="Documentos\VitaZap" />. Essa pasta não pode ser apagada nem
              movida depois, senão a extensão some.
            </p>
            <Button asChild size="sm" variant="outline">
              <a href={URL_ZIP_VITA_ZAP} download>
                <Download /> Baixar Vita Zap{versaoPublicada ? ` (v${versaoPublicada})` : ""}
              </a>
            </Button>
          </Passo>
          <Passo n={2} titulo="Abra a página de extensões do Chrome">
            <p>
              Copie o endereço, abra uma nova aba e cole na barra de endereços (esta página não consegue abrir esse link por você): <Codigo texto={ENDERECO_EXTENSOES} />
            </p>
          </Passo>
          <Passo n={3} titulo="Ligue o Modo do desenvolvedor">
            <p>É o botão no canto superior direito da página de extensões.</p>
          </Passo>
          <Passo n={4} titulo='Clique em "Carregar sem compactação"'>
            <p>Escolha a pasta do passo 1 (a que tem o arquivo manifest.json dentro). O Vita Zap aparece na lista.</p>
          </Passo>
          <Passo n={5} titulo="Abra o WhatsApp Web e conecte">
            <p>Abra web.whatsapp.com, clique em "Conectar ao CRM" na barra do topo e permita o acesso quando o Chrome pedir. Se você já está logado neste CRM, não precisa digitar a senha.</p>
          </Passo>
        </ol>
      </Panel>

      <Panel>
        <PanelHeader title="Atualizar" description="Quando aparecer 'Nova versão disponível' no painel do Vita Zap ou aqui." />
        <div className="space-y-3 px-4 py-3 text-sm text-slate-700">
          <p>
            <b>Se você usa o instalador:</b> nada a fazer. A cada vez que o computador liga ele baixa a versão nova. Depois, feche e abra o Chrome (ou clique em ↻ em{" "}
            <Codigo texto={ENDERECO_EXTENSOES} />) para aplicar. Para atualizar na hora, rode o instalador de novo.
          </p>
          <p className="font-medium text-slate-900">Atualização manual:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Baixe o zip novo (botão do passo 1).</li>
            <li>Descompacte por cima, substituindo os arquivos da mesma pasta do passo 1.</li>
            <li>
              Em <Codigo texto={ENDERECO_EXTENSOES} />, clique em ↻ no cartão do Vita Zap.
            </li>
            <li>Na aba do WhatsApp Web, aperte F5.</li>
          </ol>
        </div>
      </Panel>
    </Page>
  );
}
