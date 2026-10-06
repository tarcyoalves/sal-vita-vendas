import { useEffect, useMemo, useState } from 'react';
import { TRPCClientError } from '@trpc/client';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Sparkles,
  PlusCircle,
  Ban,
  RotateCcw,
  MessageCircle,
  Phone as PhoneIcon,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
import { Link } from 'wouter';
import { useAuth } from '../../_core/hooks/useAuth';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { Textarea } from '../ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import {
  RADAR_SEGMENTS,
  formatCnpj,
  waMeLink,
  discardReasonLabel,
  type RadarLead,
  type RadarCnpjCheck,
  type RadarEnrichment,
  type RadarLeadActivity,
  type RadarContactChannel,
} from '../../../../shared/radar';
import { CreateTaskDialog, LinkToTasks } from './CreateTaskDialog';
import { DiscardDialog } from './DiscardDialog';
import { EnrichmentSection, formatFoundDigits } from './EnrichmentSection';
import { buildPhoneOptions, defaultPhoneDigits, isTelefoneCompartilhado, normalizePhoneDigits, phoneKindLabel, sharedPhoneLabel } from './phoneOptions';
import { companyAgeLabel, daysAgoLabel, porteLabel } from './leadCardInfo';
import { defaultContactMessage } from './contactMessage';
import { useContactTemplate } from './useContactTemplate';

const SEGMENT_LABELS = new Map(RADAR_SEGMENTS.map((s) => [s.key, s.label]));

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
}

const CHANNEL_LABELS: Record<RadarContactChannel, string> = {
  whatsapp: 'WhatsApp',
  telefone: 'telefone',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aviso de contato já feito — em destaque no topo, antes de outro atendente ligar de novo. */
function ContactActivityBadge({ activity, currentUserName }: { activity: RadarLeadActivity; currentUserName: string | null }) {
  if (!activity.contactedAt) return null;
  const isOther = !!currentUserName && activity.contactedByName !== currentUserName;
  const isRecent = Date.now() - new Date(activity.contactedAt).getTime() < DAY_MS;
  const warn = isOther && isRecent;
  const channel = activity.contactChannel ? CHANNEL_LABELS[activity.contactChannel] : null;
  const quando = daysAgoLabel(activity.contactedAt) ?? formatDateTime(activity.contactedAt);
  return (
    <p
      className={`text-xs font-semibold rounded-lg px-2.5 py-2 ${
        warn ? 'bg-amber-50 text-amber-900 border border-amber-300' : 'bg-blue-50 text-blue-900 border border-blue-200'
      }`}
    >
      Contatado por {activity.contactedByName ?? 'alguém'} {quando}
      {channel ? ` (${channel})` : ''}
      {activity.contactCount > 1 ? ` · ×${activity.contactCount}` : ''}
    </p>
  );
}

export function LeadCard({
  lead,
  originIbge,
  originLabel,
  bags,
  loadDate,
  freightNote,
  activity,
  onActivityChange,
  enrichment,
  onEnrichmentChange,
  onConverted,
}: {
  lead: RadarLead;
  originIbge: number;
  originLabel: string;
  bags: number;
  loadDate?: string;
  freightNote?: string;
  activity: RadarLeadActivity;
  onActivityChange: (cnpj: string, activity: RadarLeadActivity) => void;
  enrichment: RadarEnrichment | null;
  onEnrichmentChange: (cnpj: string, enrichment: RadarEnrichment) => void;
  onConverted: () => void;
}) {
  const { user } = useAuth();
  const [verifyResult, setVerifyResult] = useState<RadarCnpjCheck | null>(null);
  const [draftProvider, setDraftProvider] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardedDetailsOpen, setDiscardedDetailsOpen] = useState(false);
  const [created, setCreated] = useState(false);
  // "Mais detalhes": aberto no desktop (md+), fechado no celular. Estado só local.
  const [detailsOpen, setDetailsOpen] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 768px)').matches,
  );
  const canRestore = user?.role === 'admin' || user?.role === 'manager';

  const displayName = lead.nomeFantasia ?? lead.razaoSocial;
  const showRazaoSmall = !!lead.nomeFantasia && lead.nomeFantasia !== lead.razaoSocial;
  const dataInicio = formatDate(lead.dataInicio);

  // ── Telefone escolhido para WhatsApp/Ligar ──
  const phoneOptions = useMemo(() => {
    const opts = buildPhoneOptions(lead, enrichment);
    // Lead que já é tarefa: o telefone cadastrado na tarefa entra na lista (primeiro).
    const tp = lead.crm.kind === 'no_crm' ? normalizePhoneDigits(lead.crm.taskPhone ?? '') : '';
    if ((tp.length === 10 || tp.length === 11) && !opts.some((o) => o.digits === tp)) {
      opts.unshift({ digits: tp, formatted: formatFoundDigits(tp), isWhatsapp: false, likelyMobile: tp.length === 11, sourceLabel: 'cadastrado na tarefa', compartilhado: false });
    }
    return opts;
  }, [lead, enrichment]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(() => defaultPhoneDigits(phoneOptions));
  useEffect(() => {
    setSelectedPhone((prev) => (prev && phoneOptions.some((p) => p.digits === prev) ? prev : defaultPhoneDigits(phoneOptions)));
  }, [phoneOptions]);

  // ── Mensagem: rascunho da IA (se pedido) ou padrão neutro montado aqui ──
  const contactTemplate = useContactTemplate();
  const defaultMessage = useMemo(
    () => defaultContactMessage({ attendantName: user?.name ?? 'nossa equipe', cityLabel: originLabel, bags, template: contactTemplate }),
    [user?.name, originLabel, bags, contactTemplate],
  );
  // Texto editado à mão ou gerado pela IA vence o padrão; null = usa o padrão (que acompanha o modelo salvo).
  const [messageOverride, setMessage] = useState<string | null>(null);
  const message = messageOverride ?? defaultMessage;
  const [messageOpen, setMessageOpen] = useState(false);

  const verifyMutation = trpc.prospectingRadar.verifyCnpj.useMutation({
    onSuccess: (data) => setVerifyResult(data),
    onError: (err) => toast.error(err.message ?? 'Erro ao confirmar CNPJ na Receita'),
  });

  const draftMutation = trpc.prospectingRadar.draftMessage.useMutation({
    onSuccess: (data) => {
      setMessage(data.message);
      setDraftProvider(data.provider);
      setMessageOpen(true);
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

  // Fire-and-forget: nunca bloqueia a navegação do WhatsApp/tel: (o botão é
  // uma âncora de verdade, o clique já abre o link antes da mutation voltar).
  const markContactedMutation = trpc.prospectingRadar.markContacted.useMutation({
    onSuccess: (data) => onActivityChange(lead.cnpj, data),
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === 'NOT_FOUND') return;
      toast.error('Não foi possível registrar o contato agora.');
    },
  });

  // Só admin/gerente restaura (o dono quer o descarte permanente para
  // atendentes, para não reabrir um lead ruim por engano) — o servidor
  // também recusa (FORBIDDEN) o atendente comum, o botão nem aparece para ele.
  const restoreMutation = trpc.prospectingRadar.restore.useMutation({
    onSuccess: (data) => onActivityChange(lead.cnpj, data),
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === 'FORBIDDEN') {
        toast.error('Somente admin ou gerente pode restaurar uma empresa descartada.');
        return;
      }
      toast.error(err.message ?? 'Erro ao restaurar');
    },
  });

  const registerContact = (channel: RadarContactChannel) => {
    markContactedMutation.mutate({ cnpj: lead.cnpj, channel });
  };

  const isCrm = lead.crm.kind === 'no_crm';
  const isDiscarded = !!activity.discarded;

  // ── Descartado: card colapsa numa linha só (expansível para ver o que já se
  // sabia da empresa). "Restaurar" só para admin/gerente — descarte de
  // atendente é permanente para não reabrir um lead ruim por engano.
  if (isDiscarded && activity.discarded) {
    const { byName, reason, note } = activity.discarded;
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setDiscardedDetailsOpen((o) => !o)}
            className="flex items-center gap-1.5 min-w-0 text-left"
          >
            {discardedDetailsOpen ? (
              <ChevronDown size={13} className="shrink-0 text-slate-400" />
            ) : (
              <ChevronRight size={13} className="shrink-0 text-slate-400" />
            )}
            <p className="text-xs text-slate-600 min-w-0 truncate">
              <span className="font-semibold text-slate-800">{displayName}</span> — Descartado por {byName} —{' '}
              {discardReasonLabel(reason)}
            </p>
          </button>
          {canRestore && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={restoreMutation.isPending}
              onClick={() => restoreMutation.mutate({ cnpj: lead.cnpj })}
            >
              {restoreMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              Restaurar
            </Button>
          )}
        </div>
        {discardedDetailsOpen && (
          <div className="space-y-2 pl-5">
            {note && <p className="text-xs text-slate-500 italic">“{note}”</p>}
            <p className="text-xs text-slate-500">{formatCnpj(lead.cnpj)}</p>
            {lead.phones.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {lead.phones.map((p) => (
                  <span key={p.digits} className="text-xs text-slate-600">{p.formatted}</span>
                ))}
              </div>
            )}
            {lead.email && <p className="text-xs text-slate-600">{lead.email}</p>}
            <EnrichmentSection enrichment={enrichment} scanning={false} onScanNow={() => {}} discarded />
          </div>
        )}
      </div>
    );
  }

  const porte = porteLabel(lead.porte);
  const idade = companyAgeLabel(lead.dataInicio);
  const tarefaLink =
    lead.crm.kind === 'no_crm' && podeAbrirTarefa(lead.crm.assignedTo, user)
      ? `/tasks?tarefa=${lead.crm.taskId}`
      : null;
  const selectedOption = phoneOptions.find((p) => p.digits === selectedPhone) ?? null;
  const selectedShared = selectedOption ? sharedPhoneLabel(selectedOption) : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
      {/* Topo compacto: quem é, onde fica, o que vende */}
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

      <p className="text-xs text-slate-600">
        {lead.municipio.nome}/{lead.municipio.uf} · ~{lead.distanceKm} km
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
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
        {porte && <Badge variant="outline" className="text-[10px]">{porte}</Badge>}
        {idade && <span className="text-[11px] text-slate-500">{idade}</span>}
      </div>

      {/* Contato já feito — em destaque, para dois atendentes não ligarem para o mesmo cliente */}
      <ContactActivityBadge activity={activity} currentUserName={user?.name ?? null} />

      {lead.crm.kind === 'excluido_antes' && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          Excluído antes: {lead.crm.reason} (por {lead.crm.deletedByName})
        </p>
      )}

      {/* Ações principais — sempre visíveis */}
      {phoneOptions.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500 shrink-0">Número:</span>
          <Select value={selectedPhone ?? undefined} onValueChange={setSelectedPhone}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {phoneOptions.map((p) => (
                <SelectItem key={p.digits} value={p.digits} className="text-xs">
                  {p.formatted}
                  {phoneKindLabel(p) ? ` · ${phoneKindLabel(p)}` : ''}
                  {sharedPhoneLabel(p) ? ` · ${sharedPhoneLabel(p)}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {selectedOption?.daWeb && selectedOption.likelyMobile && !selectedShared && (
        <p className="text-[11px] text-slate-500">
          Celular achado no {selectedOption.sourceLabel ?? 'web'} — pode não ter WhatsApp.
        </p>
      )}
      {selectedShared && (
        <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
          {selectedShared}
        </p>
      )}

      {!isCrm || selectedPhone ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            asChild
            variant="default"
            className="h-10 bg-emerald-600 hover:bg-emerald-700"
            disabled={!selectedPhone}
          >
            <a
              href={selectedPhone ? waMeLink(selectedPhone, message) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!selectedPhone}
              onClick={(e) => {
                if (!selectedPhone) { e.preventDefault(); return; }
                // Lead que já é tarefa: contato direto, sem registrar novo contato do Buscador.
                if (!isCrm) registerContact('whatsapp');
              }}
            >
              <MessageCircle size={14} />
              WhatsApp
            </a>
          </Button>
          <Button asChild variant="outline" className="h-10" disabled={!selectedPhone}>
            <a
              href={selectedPhone ? `tel:${selectedPhone}` : undefined}
              aria-disabled={!selectedPhone}
              onClick={(e) => {
                if (!selectedPhone) { e.preventDefault(); return; }
                if (!isCrm) registerContact('telefone');
              }}
            >
              <PhoneIcon size={14} />
              Ligar
            </a>
          </Button>
        </div>
      ) : null}

      {/* Atalho para a tarefa que aparece neste cartão (só se a pessoa pode abri-la). */}
      {tarefaLink && lead.crm.kind === 'no_crm' && (
        <Link
          href={tarefaLink}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
        >
          <ExternalLink size={13} /> Ir para a tarefa #{lead.crm.taskId}
        </Link>
      )}
      {isCrm && <LinkToTasks />}

      {/* Mais detalhes — recolhível (aberto no desktop, fechado no celular) */}
      <button
        type="button"
        onClick={() => setDetailsOpen((o) => !o)}
        aria-expanded={detailsOpen}
        className="flex w-full items-center gap-1 border-t border-slate-100 pt-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
      >
        {detailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Mais detalhes
      </button>

      {detailsOpen && (
        <div className="space-y-3">
          {lead.endereco && (
            <p className="text-xs text-slate-500">{lead.endereco}{lead.cep ? ` · CEP ${lead.cep}` : ''}</p>
          )}

          {/* Telefones e e-mail da base */}
          <div className="space-y-1">
            {lead.phones.length === 0 ? (
              <p className="text-xs text-slate-400">Sem telefone na base</p>
            ) : (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {lead.phones.map((p) => (
                  <span key={p.digits} className="text-xs text-slate-700 inline-flex flex-wrap items-center gap-1">
                    {p.formatted}
                    {p.likelyMobile && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[10px] font-semibold text-emerald-600 cursor-help">provável celular</span>
                        </TooltipTrigger>
                        <TooltipContent>não garante que tem WhatsApp</TooltipContent>
                      </Tooltip>
                    )}
                    {isTelefoneCompartilhado(p.compartilhadoPor) && (
                      <span className="text-[10px] font-semibold text-amber-700">
                        provável contabilidade · usado por {p.compartilhadoPor} empresas
                      </span>
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
            <span>Porte: {porte ?? 'Não informado'}</span>
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

          {!isCrm && (
            <>
              {/* Mensagem (rascunho ou padrão) — colapsável */}
              <div className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setMessageOpen((o) => !o)}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    {messageOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    Mensagem {draftProvider ? '(gerada)' : '(padrão)'}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={draftMutation.isPending}
                    onClick={() => draftMutation.mutate({ cnpj: lead.cnpj, originIbge, bags, loadDate, freightNote })}
                  >
                    {draftMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    Gerar mensagem
                  </Button>
                </div>
                {messageOpen && (
                  <div className="space-y-1">
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      className="text-xs"
                    />
                    {draftProvider && (
                      <p className="text-[10px] text-slate-400">
                        Gerado por: {draftProvider === 'modelo-fixo' ? 'texto padrão' : draftProvider}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Ações secundárias: decidir depois do contato */}
              {!created ? (
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-auto min-h-8 py-1.5 whitespace-normal text-center leading-tight text-xs"
                    onClick={() => setDialogOpen(true)}
                  >
                    <PlusCircle size={13} className="shrink-0" />
                    Transformar em tarefa
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto min-h-8 py-1.5 whitespace-normal text-center leading-tight text-xs text-red-700 border-red-200 hover:bg-red-50"
                    onClick={() => setDiscardOpen(true)}
                  >
                    <Ban size={13} className="shrink-0" />
                    Descartar
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-0.5">
                  <Badge variant="secondary" className="text-emerald-700 bg-emerald-50 border-emerald-200">Virou tarefa</Badge>
                  <LinkToTasks />
                </div>
              )}
            </>
          )}
        </div>
      )}

      <CreateTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lead={lead}
        enrichment={enrichment}
        originIbge={originIbge}
        bags={bags}
        initialMessage={message}
        onCreated={() => {
          setCreated(true);
          onConverted();
        }}
      />

      <DiscardDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        lead={lead}
        onDiscarded={(next) => onActivityChange(lead.cnpj, next)}
      />
    </div>
  );
}

/** Admin e gerente abrem qualquer tarefa; atendente só as que são dele (o servidor não entrega as dos outros). */
function podeAbrirTarefa(assignedTo: string | null, user: { name?: string | null; role?: string } | null | undefined): boolean {
  if (user?.role === 'admin' || user?.role === 'manager') return true;
  return !!assignedTo && assignedTo.trim().toLowerCase() === (user?.name ?? '').trim().toLowerCase();
}

function CrmBadge({ lead }: { lead: RadarLead }) {
  const { user } = useAuth();
  if (lead.clienteAtivo) {
    return <Badge className="bg-blue-900 hover:bg-blue-900 text-white shrink-0 text-[10px]">Cliente ativo</Badge>;
  }
  if (lead.crm.kind === 'novo') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white shrink-0">Novo</Badge>;
  }
  if (lead.crm.kind === 'no_crm') {
    // Só aviso: qualquer atendente pode pesquisar, mas fica claro quando outro já acompanha.
    const dono = lead.crm.assignedTo;
    const outro = !!dono && dono.trim().toLowerCase() !== (user?.name ?? '').trim().toLowerCase();
    return (
      <Badge
        variant={outro ? 'outline' : 'secondary'}
        className={`shrink-0 text-right whitespace-normal text-[10px] leading-tight ${outro ? 'border-amber-400 text-amber-700 bg-amber-50' : ''}`}
      >
        {outro ? `Outro atendente acompanha: ${dono}` : `Já no CRM — ${dono ?? 'sem responsável'}`}
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
