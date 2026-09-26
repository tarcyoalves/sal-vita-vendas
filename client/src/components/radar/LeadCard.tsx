import { useState } from 'react';
import { TRPCClientError } from '@trpc/client';
import { CheckCircle2, XCircle, Loader2, ExternalLink, Sparkles, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { Textarea } from '../ui/textarea';
import {
  RADAR_SEGMENTS,
  formatCnpj,
  type RadarLead,
  type RadarCnpjCheck,
  type RadarEnrichment,
} from '../../../../shared/radar';
import { CreateTaskDialog, OpenWhatsAppButton, LinkToTasks } from './CreateTaskDialog';
import { EnrichmentSection } from './EnrichmentSection';

const SEGMENT_LABELS = new Map(RADAR_SEGMENTS.map((s) => [s.key, s.label]));

function porteLabel(porte: string | null): string {
  switch (porte) {
    case '01': return 'ME';
    case '03': return 'EPP';
    case '05': return 'Demais';
    default: return 'Não informado';
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function LeadCard({
  lead,
  originIbge,
  bags,
  loadDate,
  freightNote,
  enrichment,
  onEnrichmentChange,
  onConverted,
}: {
  lead: RadarLead;
  originIbge: number;
  bags: number;
  loadDate?: string;
  freightNote?: string;
  enrichment: RadarEnrichment | null;
  onEnrichmentChange: (cnpj: string, enrichment: RadarEnrichment) => void;
  onConverted: () => void;
}) {
  const [verifyResult, setVerifyResult] = useState<RadarCnpjCheck | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [draftProvider, setDraftProvider] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [created, setCreated] = useState<{ phoneDigits: string | null; message: string } | null>(null);

  const verifyMutation = trpc.prospectingRadar.verifyCnpj.useMutation({
    onSuccess: (data) => setVerifyResult(data),
    onError: (err) => toast.error(err.message ?? 'Erro ao confirmar CNPJ na Receita'),
  });

  const draftMutation = trpc.prospectingRadar.draftMessage.useMutation({
    onSuccess: (data) => {
      setDraftMessage(data.message);
      setDraftProvider(data.provider);
    },
    onError: (err) => toast.error(err.message ?? 'Erro ao gerar mensagem'),
  });

  const enrichNowMutation = trpc.prospectingRadar.enrichNow.useMutation({
    onSuccess: (data) => onEnrichmentChange(lead.cnpj, data),
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === 'PRECONDITION_FAILED') {
        toast.error('Robô de busca na web está desligado agora. Tente novamente mais tarde.');
        return;
      }
      if (err instanceof TRPCClientError && err.data?.code === 'NOT_IMPLEMENTED') return;
      toast.error(err.message ?? 'Não foi possível varrer agora');
    },
  });

  const displayName = lead.nomeFantasia ?? lead.razaoSocial;
  const showRazaoSmall = !!lead.nomeFantasia && lead.nomeFantasia !== lead.razaoSocial;
  const dataInicio = formatDate(lead.dataInicio);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 truncate">{displayName}</h3>
          {showRazaoSmall && (
            <p className="text-[11px] text-slate-400 truncate">{lead.razaoSocial}</p>
          )}
          <p className="text-xs text-slate-500 mt-0.5">{formatCnpj(lead.cnpj)}</p>
        </div>
        <CrmBadge lead={lead} />
      </div>

      {lead.crm.kind === 'excluido_antes' && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          Excluído antes: {lead.crm.reason} (por {lead.crm.deletedByName})
        </p>
      )}

      {/* Segmentos */}
      <div className="flex flex-wrap gap-1.5">
        {lead.segments.map((s) => (
          <Badge key={s} variant="secondary" className="text-[10px]">
            {SEGMENT_LABELS.get(s) ?? s}
          </Badge>
        ))}
        {!lead.matchedByPrincipal && (
          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
            CNAE secundário
          </Badge>
        )}
      </div>

      {/* Localização */}
      <p className="text-xs text-slate-600">
        {lead.municipio.nome} - {lead.municipio.uf} · ~{lead.distanceKm} km (linha reta)
      </p>
      {lead.endereco && <p className="text-xs text-slate-500">{lead.endereco}{lead.cep ? ` · CEP ${lead.cep}` : ''}</p>}

      {/* Contato */}
      <div className="space-y-1">
        {lead.phones.length === 0 ? (
          <p className="text-xs text-slate-400">Sem telefone na base</p>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {lead.phones.map((p) => (
              <span key={p.digits} className="text-xs text-slate-700 inline-flex items-center gap-1">
                {p.formatted}
                {p.likelyMobile && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] font-semibold text-emerald-600 cursor-help">provável celular</span>
                    </TooltipTrigger>
                    <TooltipContent>não garante que tem WhatsApp</TooltipContent>
                  </Tooltip>
                )}
              </span>
            ))}
          </div>
        )}
        {lead.email && (
          <p className={`text-xs ${lead.emailSuppressed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
            {lead.email}
            {lead.emailSuppressed && <span className="ml-1.5 no-underline text-[10px] text-amber-600">descadastrado</span>}
          </p>
        )}
      </div>

      {/* Enriquecimento por scraping (Fase 2) */}
      <EnrichmentSection
        enrichment={enrichment}
        scanning={enrichNowMutation.isPending}
        onScanNow={(force) => enrichNowMutation.mutate({ cnpj: lead.cnpj, force })}
      />

      {/* Metadados */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-400">
        <span>Porte: {porteLabel(lead.porte)}</span>
        {dataInicio && <span>Início: {dataInicio}</span>}
        <a
          href="http://www.sintegra.gov.br/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
        >
          IE: consultar no SINTEGRA <ExternalLink size={10} />
        </a>
      </div>

      {/* Verificação de CNPJ */}
      {verifyResult && (
        <div className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 ${
          verifyResult.ativa ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {verifyResult.ativa ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
          <span>{verifyResult.situacao} · checado às {new Date(verifyResult.checkedAt).toLocaleTimeString('pt-BR')}</span>
        </div>
      )}

      {/* Rascunho de mensagem */}
      {draftMessage !== null && (
        <div className="space-y-1">
          <Textarea
            value={draftMessage}
            onChange={(e) => setDraftMessage(e.target.value)}
            rows={4}
            className="text-xs"
          />
          <p className="text-[10px] text-slate-400">
            Gerado por: {draftProvider === 'modelo-fixo' ? 'texto padrão' : draftProvider}
          </p>
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={verifyMutation.isPending}
          onClick={() => verifyMutation.mutate({ cnpj: lead.cnpj })}
        >
          {verifyMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          Confirmar na Receita
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={draftMutation.isPending}
          onClick={() => draftMutation.mutate({ cnpj: lead.cnpj, originIbge, bags, loadDate, freightNote })}
        >
          {draftMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Gerar mensagem
        </Button>
        {lead.crm.kind !== 'no_crm' && !created && (
          <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
            <PlusCircle size={13} />
            Criar tarefa
          </Button>
        )}
        {lead.crm.kind === 'no_crm' && <LinkToTasks />}
        {created && (
          <>
            <Badge variant="secondary" className="text-emerald-700 bg-emerald-50 border-emerald-200">Tarefa criada</Badge>
            {created.phoneDigits && (
              <OpenWhatsAppButton phoneDigits={created.phoneDigits} message={created.message} />
            )}
          </>
        )}
      </div>

      <CreateTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lead={lead}
        enrichment={enrichment}
        originIbge={originIbge}
        bags={bags}
        initialMessage={draftMessage ?? ''}
        onCreated={({ phoneDigits, message }) => {
          setCreated({ phoneDigits, message });
          onConverted();
        }}
      />
    </div>
  );
}

function CrmBadge({ lead }: { lead: RadarLead }) {
  if (lead.crm.kind === 'novo') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white shrink-0">Novo</Badge>;
  }
  if (lead.crm.kind === 'no_crm') {
    return (
      <Badge variant="secondary" className="shrink-0 text-right whitespace-normal text-[10px] leading-tight">
        Já no CRM — {lead.crm.assignedTo ?? 'sem responsável'}
        {lead.crm.converted ? ' · cliente' : ''}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-700 bg-amber-50 text-[10px] whitespace-normal text-right leading-tight">
      Excluído antes
    </Badge>
  );
}
