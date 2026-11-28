import { useState } from 'react';
import { trpc } from '../../../lib/trpc';
import { btn, INPUT } from '../../../components/premium/admin/adminUi';
import { ConfirmDialog } from '../../../components/premium/admin/ConfirmDialog';
import type { SalesSettings } from '../../../../../shared/sales';
import { Aviso, Campo, Card, Consulta, Interruptor, Pill, fmtData } from './ui';
import { CampoNumero, CampoTexto, textoOuNulo } from './campos';
import { useSalvarSetting } from './useSalvarSetting';
import { DISPONIBILIDADE_LABEL, PLACEHOLDERS, UFS } from './motivos';

const Salvar = ({ pendente, ok = true, aoClicar, rotulo = 'Salvar' }: { pendente: boolean; ok?: boolean; aoClicar: () => void; rotulo?: string }) => (
  <button type="button" disabled={pendente || !ok} onClick={aoClicar} className={`${btn.primary} mt-3`}>{rotulo}</button>
);

function Limites({ inicial }: { inicial: SalesSettings['limites'] }) {
  const [v, setV] = useState(inicial);
  const [cad, setCad] = useState(inicial.cadenciaDias.join(', '));
  const { salvar, pendente } = useSalvarSetting();
  const cadencia = cad.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  const ok = Object.entries(v).every(([k, x]) => k === 'cadenciaDias' || Number.isFinite(x)) && cadencia.length >= 1 && cadencia.length <= 3 && cadencia.every((n) => Number.isInteger(n) && n >= 0);
  return (
    <Card titulo="Limites de envio">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <CampoNumero rotulo="Empresas novas por dia" valor={v.novasEmpresasDia} aoMudar={(n) => setV({ ...v, novasEmpresasDia: n })} min={0} max={500} />
        <CampoNumero rotulo="E-mails por dia" valor={v.enviosDia} aoMudar={(n) => setV({ ...v, enviosDia: n })} min={0} max={1500} />
        <CampoNumero rotulo="Horas entre mensagens ao mesmo e-mail" dica="Mínimo 24" valor={v.intervaloMinHoras} aoMudar={(n) => setV({ ...v, intervaloMinHoras: n })} min={24} />
        <CampoNumero rotulo="Mensagens por empresa" dica="1 a 3" valor={v.maxMensagensPorEmpresa} aoMudar={(n) => setV({ ...v, maxMensagensPorEmpresa: n })} min={1} max={3} />
        <CampoTexto rotulo="Dias da sequência" dica="Ex.: 0, 4, 10 (até 3 números)" valor={cad} aoMudar={setCad} />
        <CampoNumero rotulo="Minutos de reserva" valor={v.reservaMinutos} aoMudar={(n) => setV({ ...v, reservaMinutos: n })} min={1} max={60} />
        <CampoNumero rotulo="Segundos para enviar" valor={v.despachoSegundos} aoMudar={(n) => setV({ ...v, despachoSegundos: n })} min={30} max={600} />
        <CampoNumero rotulo="Tentativas por mensagem" valor={v.maxTentativas} aoMudar={(n) => setV({ ...v, maxTentativas: n })} min={1} max={5} />
      </div>
      <Salvar pendente={pendente} ok={ok} aoClicar={() => salvar('limites', { ...v, cadenciaDias: cadencia })} />
    </Card>
  );
}

function Remetente({ inicial }: { inicial: SalesSettings['remetente'] }) {
  const [v, setV] = useState(inicial);
  const { salvar, pendente } = useSalvarSetting();
  return (
    <Card titulo="Remetente (aparece no rodapé do e-mail)">
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoTexto rotulo="Nome" valor={v.nome} aoMudar={(s) => setV({ ...v, nome: s })} max={120} />
        <CampoTexto rotulo="Razão social" valor={v.razaoSocial} aoMudar={(s) => setV({ ...v, razaoSocial: s })} max={200} />
        <CampoTexto rotulo="CNPJ" valor={v.cnpj} aoMudar={(s) => setV({ ...v, cnpj: s })} max={30} />
        <CampoTexto rotulo="Endereço" valor={v.endereco} aoMudar={(s) => setV({ ...v, endereco: s })} max={300} />
        <CampoTexto rotulo="Link do site" valor={v.linkSite} aoMudar={(s) => setV({ ...v, linkSite: s })} max={300} />
        <CampoTexto rotulo="Link do Mercado Livre" valor={v.linkMercadoLivre} aoMudar={(s) => setV({ ...v, linkMercadoLivre: s })} max={500} />
      </div>
      <Salvar pendente={pendente} aoClicar={() => salvar('remetente', v)} />
    </Card>
  );
}

function Canal({ inicial }: { inicial: SalesSettings['canal'] }) {
  const [v, setV] = useState(inicial);
  const { salvar, pendente } = useSalvarSetting();
  const t = (k: 'provedor' | 'termosUrl' | 'termosConferidosEm' | 'responsavel' | 'conclusao' | 'dominio' | 'remetenteEmail') => (s: string) => setV({ ...v, [k]: textoOuNulo(s) });
  return (
    <Card titulo="Canal de envio (prospecção)">
      <Aviso tom="rose" titulo="Resend e Brevo não servem para prospecção">
        As políticas do Resend e do Brevo proíbem enviar e-mail frio para quem não pediu. Eles ficam só para e-mails de pedido e de quem já é cliente. Use outra caixa de envio e registre abaixo que você conferiu os termos dela.
      </Aviso>
      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <CampoTexto rotulo="Provedor / caixa de envio" valor={v.provedor ?? ''} aoMudar={t('provedor')} max={120} />
        <CampoTexto rotulo="Endereço dos termos" valor={v.termosUrl ?? ''} aoMudar={t('termosUrl')} max={500} />
        <Campo rotulo="Termos conferidos em">
          <input type="date" value={(v.termosConferidosEm ?? '').slice(0, 10)} onChange={(e) => t('termosConferidosEm')(e.target.value)} className={INPUT} />
        </Campo>
        <CampoTexto rotulo="Quem conferiu" valor={v.responsavel ?? ''} aoMudar={t('responsavel')} max={120} />
        <CampoTexto rotulo="Domínio do remetente" dica="Ex.: salvitarn.com.br" valor={v.dominio ?? ''} aoMudar={t('dominio')} max={200} />
        <CampoTexto rotulo="E-mail do remetente" valor={v.remetenteEmail ?? ''} aoMudar={t('remetenteEmail')} max={200} />
      </div>
      <div className="mt-3">
        <Campo rotulo="Conclusão da conferência" dica="O que os termos dizem sobre e-mail comercial para empresas">
          <textarea value={v.conclusao ?? ''} onChange={(e) => t('conclusao')(e.target.value)} rows={3} maxLength={2000} className={INPUT} />
        </Campo>
      </div>
      <Interruptor ligado={v.politicaAprovada} onChange={(x) => setV({ ...v, politicaAprovada: x })} rotulo="Política do provedor aprovada por mim" />
      <Interruptor ligado={v.ativo} onChange={(x) => setV({ ...v, ativo: x })} rotulo={v.ativo ? 'Canal LIGADO' : 'Canal desligado'} />
      {v.ativo && !inicial.ativo && <Aviso tom="amber">Ao salvar, o canal liga. Ainda assim nada sai enquanto o modo for Simulação.</Aviso>}
      <Salvar pendente={pendente} aoClicar={() => salvar('canal', v)} />
    </Card>
  );
}

function ReferenciaML({ inicial }: { inicial: SalesSettings['referenciaMercadoLivre'] }) {
  const [reais, setReais] = useState(inicial.precoCentavos === null ? '' : (inicial.precoCentavos / 100).toFixed(2).replace('.', ','));
  const [url, setUrl] = useState(inicial.url ?? '');
  const [em, setEm] = useState((inicial.conferidoEm ?? '').slice(0, 10));
  const { salvar, pendente } = useSalvarSetting();
  const num = reais.trim() === '' ? null : Number(reais.replace(/\./g, '').replace(',', '.'));
  const ok = num === null || (Number.isFinite(num) && num >= 0);
  return (
    <Card titulo="Referência do Mercado Livre">
      <p className="text-xs text-slate-600 mb-3">Só é mostrada como preço atual se foi conferida nos últimos 30 dias.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <CampoTexto rotulo="Preço (R$)" valor={reais} aoMudar={setReais} placeholder="0,00" />
        <CampoTexto rotulo="Endereço do anúncio" valor={url} aoMudar={setUrl} max={500} />
        <Campo rotulo="Conferido em"><input type="date" value={em} onChange={(e) => setEm(e.target.value)} className={INPUT} /></Campo>
      </div>
      <Salvar pendente={pendente} ok={ok} aoClicar={() => salvar('referenciaMercadoLivre', { precoCentavos: num === null ? null : Math.round(num * 100), url: textoOuNulo(url), conferidoEm: textoOuNulo(em) })} />
    </Card>
  );
}

function Ondas({ inicial }: { inicial: SalesSettings['ondas'] }) {
  const [ufs, setUfs] = useState(inicial.ufs);
  const { salvar, pendente } = useSalvarSetting();
  const alterna = (uf: string) => setUfs(ufs.includes(uf) ? ufs.filter((x) => x !== uf) : [...ufs, uf]);
  return (
    <Card titulo="Estados da onda de prospecção">
      <div className="grid grid-cols-5 sm:grid-cols-9 gap-1.5">
        {UFS.map((uf) => (
          <button key={uf} type="button" aria-pressed={ufs.includes(uf)} onClick={() => alterna(uf)}
            className={`min-h-[44px] rounded-lg border text-xs font-semibold cursor-pointer ${ufs.includes(uf) ? 'bg-[#0b1d3a] text-white border-[#0b1d3a]' : 'bg-white text-slate-700 border-slate-300'}`}>{uf}</button>
        ))}
      </div>
      <Salvar pendente={pendente} aoClicar={() => salvar('ondas', { ufs })} />
    </Card>
  );
}

function Atendente({ inicial }: { inicial: SalesSettings['atendente'] }) {
  const [a, setA] = useState(inicial.crmUserId === null ? '' : String(inicial.crmUserId));
  const [b, setB] = useState(inicial.substitutoCrmUserId === null ? '' : String(inicial.substitutoCrmUserId));
  const { salvar, pendente } = useSalvarSetting();
  const conv = (s: string) => (s.trim() === '' ? null : Number(s));
  const ok = [conv(a), conv(b)].every((n) => n === null || Number.isInteger(n));
  return (
    <Card titulo="Atendente no CRM">
      <p className="text-xs text-slate-600 mb-3">Quem recebe as tarefas quando uma empresa responde. Informe o número do usuário no CRM.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoTexto rotulo="Atendente (nº do usuário)" valor={a} aoMudar={setA} />
        <CampoTexto rotulo="Substituto (nº do usuário)" valor={b} aoMudar={setB} />
      </div>
      <Salvar pendente={pendente} ok={ok} aoClicar={() => salvar('atendente', { crmUserId: conv(a), substitutoCrmUserId: conv(b) })} />
    </Card>
  );
}

function Disponibilidade({ inicial }: { inicial: SalesSettings['disponibilidade'] }) {
  const [v, setV] = useState(inicial);
  const { salvar, pendente } = useSalvarSetting();
  return (
    <Card titulo="Estoque da caixa de 10 kg">
      <p className="text-xs text-slate-600 mb-3">"Não informado" faz o assistente não afirmar nada sobre estoque. Atualizado em: {fmtData(inicial.atualizadoEm)}.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Situação">
          <select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as typeof v.status })} className={INPUT}>
            {Object.entries(DISPONIBILIDADE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Campo>
        <CampoTexto rotulo="Quem informou" valor={v.responsavel ?? ''} aoMudar={(s) => setV({ ...v, responsavel: textoOuNulo(s) })} max={120} />
        <CampoTexto rotulo="Observação" valor={v.observacao ?? ''} aoMudar={(s) => setV({ ...v, observacao: textoOuNulo(s) })} max={300} />
      </div>
      <Salvar pendente={pendente} aoClicar={() => salvar('disponibilidade', { ...v, atualizadoEm: new Date().toISOString() })} />
    </Card>
  );
}

function Segmentos({ inicial }: { inicial: SalesSettings['segmentosValidados'] }) {
  const [txt, setTxt] = useState(inicial.segmentos.join('\n'));
  const { salvar, pendente } = useSalvarSetting();
  const lista = txt.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  return (
    <Card titulo="Segmentos já validados">
      <p className="text-xs text-slate-600 mb-3">No modo Semiautônomo, só estes segmentos saem sem aprovação. Um por linha.</p>
      <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={4} className={INPUT} aria-label="Segmentos validados" />
      <Salvar pendente={pendente} aoClicar={() => salvar('segmentosValidados', { segmentos: lista })} />
    </Card>
  );
}

function Simulador({ inicial }: { inicial: SalesSettings['simuladorRevenda'] }) {
  const { salvar, pendente } = useSalvarSetting();
  return (
    <Card titulo="Simulador de revenda">
      <Interruptor ligado={inicial.ativo} disabled={pendente} onChange={(x) => salvar('simuladorRevenda', { ativo: x })} rotulo={inicial.ativo ? 'Ligado na página /atacado' : 'Desligado'} />
    </Card>
  );
}

function ModeloEmail({ inicial }: { inicial: SalesSettings['modeloEmail'] }) {
  const [v, setV] = useState(inicial);
  const [aprovar, setAprovar] = useState(false);
  const { salvar, pendente } = useSalvarSetting();
  const mudaPasso = (i: number, campo: 'assunto' | 'corpo', s: string) =>
    setV({ ...v, passos: v.passos.map((p, j) => (j === i ? { ...p, [campo]: s } : p)) });
  return (
    <Card titulo="Modelo do e-mail de prospecção" acao={v.status === 'aprovado' ? <Pill tom="emerald">Aprovado por {inicial.aprovadoPor ?? '—'} em {fmtData(inicial.aprovadoEm)}</Pill> : <Pill tom="amber">Rascunho: nada é gerado</Pill>}>
      <p className="text-xs text-slate-600 mb-3">Três passos: apresentação, lembrete e despedida. Sem modelo aprovado nenhuma mensagem é montada. O texto não pode ter alegação de saúde, de minerais ou de "sem aditivos".</p>
      <details className="rounded-xl border border-slate-200 p-3 mb-3">
        <summary className="text-xs font-semibold cursor-pointer min-h-[32px] flex items-center">Variáveis que você pode usar</summary>
        <ul className="mt-2 space-y-1 text-[12px]">
          {PLACEHOLDERS.map((p) => <li key={p.chave}><code className="font-mono bg-slate-100 rounded px-1 break-all">{p.chave}</code> <span className="text-slate-600">{p.descricao}</span></li>)}
        </ul>
      </details>
      <div className="space-y-4">
        {v.passos.map((p, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-bold text-slate-700">Passo {i + 1}</p>
            <CampoTexto rotulo="Assunto" valor={p.assunto} aoMudar={(s) => mudaPasso(i, 'assunto', s)} max={200} />
            <Campo rotulo="Texto"><textarea value={p.corpo} onChange={(e) => mudaPasso(i, 'corpo', e.target.value)} rows={9} maxLength={4000} className={`${INPUT} font-mono text-xs`} /></Campo>
          </div>
        ))}
      </div>
      <Interruptor ligado={v.aberturaPorIa} onChange={(x) => setV({ ...v, aberturaPorIa: x })} rotulo="Linha de abertura escrita por IA (passa pelas mesmas travas)" />
      <div className="flex flex-col sm:flex-row gap-2 mt-3">
        <button type="button" disabled={pendente} onClick={() => salvar('modeloEmail', { ...v, status: 'rascunho' })} className={btn.secondary}>Salvar como rascunho</button>
        <button type="button" disabled={pendente} onClick={() => setAprovar(true)} className={btn.success}>Aprovar este modelo</button>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Salvar como rascunho tira a aprovação. O servidor confere o texto ao aprovar e recusa se houver termo proibido.</p>
      <ConfirmDialog
        open={aprovar}
        onOpenChange={setAprovar}
        title="Aprovar este modelo?"
        description={<p>Você confirma que leu os {v.passos.length} passos e que o texto pode ser enviado a empresas. O servidor registra seu nome e a hora.</p>}
        confirmLabel="Aprovar modelo"
        onConfirm={() => salvar('modeloEmail', { ...v, status: 'aprovado' })}
      />
    </Card>
  );
}

export default function ConfigTab() {
  const q = trpc.sales.settingsLer.useQuery();
  const s = q.data;
  const k = (x: unknown) => JSON.stringify(x);
  return (
    <Consulta carregando={q.isLoading} erro={q.error} refazer={() => q.refetch()}>
      {s && (
        <div className="space-y-4">
          <Canal key={k(s.canal)} inicial={s.canal} />
          <ModeloEmail key={k(s.modeloEmail)} inicial={s.modeloEmail} />
          <Remetente key={k(s.remetente)} inicial={s.remetente} />
          <Limites key={k(s.limites)} inicial={s.limites} />
          <Ondas key={k(s.ondas)} inicial={s.ondas} />
          <Segmentos key={k(s.segmentosValidados)} inicial={s.segmentosValidados} />
          <Disponibilidade key={k(s.disponibilidade)} inicial={s.disponibilidade} />
          <ReferenciaML key={k(s.referenciaMercadoLivre)} inicial={s.referenciaMercadoLivre} />
          <Atendente key={k(s.atendente)} inicial={s.atendente} />
          <Simulador key={k(s.simuladorRevenda)} inicial={s.simuladorRevenda} />
        </div>
      )}
    </Consulta>
  );
}
