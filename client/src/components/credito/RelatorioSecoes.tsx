// Seções do relatório de crédito na tela (mesmas do PDF): empresa, anotações/ocorrências, sócios, consultas e comportamento.
// Usadas pelo RelatorioCreditoDialog nos dois modos (uma consulta ou o consolidado do CNPJ).
import { formatBRL } from '../../lib/faturamento/calc';
import { mascararDocumentoSocio } from '../../lib/credito/documento';
import { dataBR, mesAnoBR } from '../../lib/credito/regras';
import { naturezaJuridicaTexto } from '../../../../shared/creditoRotulos';
import { atenuacaoDoItem, type ComportamentoTela, type RelatorioConsolidado, type RelatorioCredito, type TabelaTela } from '../../../../shared/credito';

export const GRUPOS: Array<[keyof RelatorioCredito['anotacoes'], string]> = [
  ['protestos', 'Protestos'],
  ['pendenciasFinanceiras', 'Pendências financeiras (PEFIN/REFIN)'],
  ['chequesSemFundo', 'Cheques sem fundo'],
  ['acoesJudiciais', 'Ações judiciais'],
  ['falenciaRecuperacao', 'Falência / Recuperação judicial'],
];

export const txt = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v));
export const brl = (n: number | null) => (n === null ? '—' : formatBRL(n));
export const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);

export function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="border-b-2 border-brand-700 pb-1 text-sm font-semibold uppercase tracking-wide text-brand-700">{titulo}</h3>
      {children}
    </section>
  );
}

export function Campos({ pares }: { pares: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {pares.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-slate-500">{k}</dt>
          <dd className="break-words text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function TabelaPequena({ t }: { t: TabelaTela }) {
  return (
    <div className="space-y-1">
      {t.titulo && <p className="text-xs font-semibold text-slate-700">{t.titulo}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[520px] text-xs tabular-nums">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{t.colunas.map((c, i) => <th key={`${c}-${i}`} className={`px-2 py-1.5 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {t.linhas.map((l, i) => (
              <tr key={i} className="border-t border-slate-100">
                {l.map((v, j) => <td key={j} className={`px-2 py-1 ${j === 0 ? 'text-left font-medium' : 'text-right'}`}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Anotações negativas (individual) / detalhamento das ocorrências (consolidado) ─────────────────────────────
function ItensDoGrupo({ g, agora }: { g: RelatorioCredito['anotacoes'][keyof RelatorioCredito['anotacoes']]; agora: Date }) {
  return (
    <>
      {g.itens.length < g.quantidade && <p className="text-xs font-medium text-amber-800">A fonte listou {g.itens.length} de {g.quantidade} ocorrências.</p>}
      {g.itens.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {g.itens.map((it, i) => {
            const obs = atenuacaoDoItem(it, agora);
            return (
              <li key={`${i}-${it.descricao}`} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[6rem_1fr_auto] sm:gap-3">
                <span className="text-xs text-slate-500">{it.data ? dataBR(it.data) : ''}</span>
                <span className="min-w-0 break-words text-slate-800">
                  {it.descricao}
                  {it.credor && <span className="block text-xs text-slate-500">Credor: {it.credor}</span>}
                  {it.local && <span className="block text-xs text-slate-500">{it.local}</span>}
                  {it.processo && <span className="block text-xs text-slate-500">Processo: {it.processo}</span>}
                  {it.fonte && <span className="block text-xs text-slate-500">Fonte: {it.fonte}</span>}
                  {it.extras && Object.entries(it.extras).length > 0 && (
                    <span className="mt-0.5 block text-xs text-slate-500">{Object.entries(it.extras).map(([ch, v]) => `${ch}: ${v}`).join(' · ')}</span>
                  )}
                  {obs && <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">Estudar com calma: {obs}</span>}
                </span>
                <span className="text-right font-medium tabular-nums">{it.valor !== null ? brl(it.valor) : ''}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/**
 * Consolidado: só o DETALHAMENTO (a quantidade e o valor por fonte já estão na matriz de comparação, sem repetir).
 * Individual: tabela-resumo + "sem ocorrências"/"não informado" + o detalhamento.
 */
export function Anotacoes({ r, agora, consolidado }: { r: RelatorioCredito; agora: Date; consolidado?: boolean }) {
  const com = GRUPOS.filter(([k]) => r.anotacoes[k].consultado && (r.anotacoes[k].itens.length > 0 || r.anotacoes[k].quantidade > 0));
  const zerados = GRUPOS.filter(([k]) => r.anotacoes[k].consultado && !com.some(([c]) => c === k)).map(([, n]) => n.replace(/ \(.*\)$/, ''));
  const nao = GRUPOS.filter(([k]) => !r.anotacoes[k].consultado).map(([, n]) => n.replace(/ \(.*\)$/, ''));
  if (consolidado && com.length === 0) return null;
  return (
    <Secao titulo={consolidado ? 'Detalhamento das ocorrências' : 'Anotações negativas'}>
      {!consolidado && com.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[360px] text-sm tabular-nums">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Quantidade</th><th className="px-3 py-2 text-right">Valor total</th></tr>
            </thead>
            <tbody>
              {com.map(([k, nome]) => {
                const g = r.anotacoes[k];
                return (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-red-700">{nome}</td>
                    <td className="px-3 py-2 text-right">{Math.max(g.quantidade, g.itens.length)}</td>
                    <td className="px-3 py-2 text-right">{g.valorTotal !== null ? brl(g.valorTotal) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!consolidado && zerados.length > 0 && <p className="text-sm font-medium text-green-700">Sem ocorrências em: {zerados.join(', ')}.</p>}
      {!consolidado && nao.length > 0 && <p className="text-xs text-slate-500">Não informado pela fonte: {nao.join(', ')}.</p>}
      {com.map(([k, nome]) => (
        <div key={k} className="space-y-1">
          <p className="text-sm font-semibold text-slate-800">{nome.replace(/ \(.*\)$/, '')}</p>
          <ItensDoGrupo g={r.anotacoes[k]} agora={agora} />
        </div>
      ))}
    </Secao>
  );
}

// ── Dados da empresa ───────────────────────────────────────────────────────────────────────────────────────
export function DadosDaEmpresa({ r }: { r: RelatorioCredito }) {
  const c = r.cadastro;
  const comp = r.complementos;
  const fant = c.nomeFantasia && c.nomeFantasia !== c.razaoSocial ? c.nomeFantasia : '';
  const ender = [c.endereco, [c.municipio, c.uf].filter(Boolean).join('/')].filter(Boolean).join(' — ');
  const sec = (comp?.cnaesSecundarios ?? []).filter((x) => x !== c.cnaePrincipal);
  const rep = comp?.representante;
  const pares = ([
    ['Nome fantasia', fant],
    ['Situação', c.situacao ? c.situacao + (c.situacaoEm && c.situacaoEm !== c.fundacao ? ` (desde ${dataBR(c.situacaoEm)})` : '') : ''],
    ['Fundação', c.fundacao ? dataBR(c.fundacao) : ''],
    ['Natureza jurídica', naturezaJuridicaTexto(c.naturezaJuridica)],
    ['Capital social', c.capitalSocial === null ? '' : brl(c.capitalSocial)],
    ['Porte / funcionários', comp?.funcionariosFaixa ? `${comp.funcionariosFaixa} funcionários` : ''],
    ['Faturamento presumido', comp?.faturamentoPresumidoFaixa ?? ''],
    ['Tempo de atuação', comp?.tempoAtuacao ?? ''],
    ['Matriz / filial', comp?.matrizFilial ?? ''],
    ['Inscrição estadual (IE)', c.inscricaoEstadual ?? ''],
    ['Opção tributária', c.opcaoTributaria ?? ''],
    ['Nº de filiais', c.numeroFiliais === null ? '' : String(c.numeroFiliais)],
    ['CNAE e atividade', [c.cnaePrincipal, c.atividade].filter(Boolean).join(' — ')],
    ['CNAEs secundários', sec.slice(0, 5).join('; ') + (sec.length > 5 ? `; +${sec.length - 5}` : '')],
    ['Endereço', ender],
    ['Representante', rep && (rep.nome || rep.documento) ? [rep.nome, rep.documento ? mascararDocumentoSocio(rep.documento) : ''].filter(Boolean).join(' — ') : ''],
    ['Veículos da empresa', comp?.veiculos?.length ? comp.veiculos.map((v) => v.marcaModelo).join('; ') : ''],
  ] as Array<[string, string]>).filter(([, v]) => v !== '');
  return pares.length ? <Secao titulo="Dados da empresa"><Campos pares={pares} /></Secao> : null;
}

// ── Sócios ─────────────────────────────────────────────────────────────────────────────────────────────────
export function Socios({ r }: { r: RelatorioCredito }) {
  if (!r.socios.length) return null;
  return (
    <Secao titulo="Sócios e administradores">
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
        {r.socios.map((s, i) => (
          <li key={`${i}-${s.nome}`} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[1fr_9rem_9rem_5rem] sm:gap-3">
            <span className="min-w-0 break-words font-medium text-slate-900">{s.nome}{s.cargo && <span className="block text-xs font-normal text-slate-500">{s.cargo}</span>}</span>
            <span className="tabular-nums text-slate-700">{mascararDocumentoSocio(s.documento)}</span>
            <span className="text-slate-700">{s.entrada ? `Entrada ${dataBR(s.entrada)}` : ''}</span>
            <span className="tabular-nums text-slate-700 sm:text-right">{s.participacao !== null ? pct(s.participacao) : ''}</span>
          </li>
        ))}
      </ul>
    </Secao>
  );
}

// ── Consultas ao documento ─────────────────────────────────────────────────────────────────────────────────
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const mesAno = (aaaamm: string | null) => { const m = aaaamm ? /^(\d{4})-(\d{2})/.exec(aaaamm) : null; return m ? `${m[2]}/${m[1]}` : '—'; };

export function ConsultasDoDocumento({ r, consolidado }: { r: RelatorioCredito; consolidado?: RelatorioConsolidado }) {
  const comp = r.complementos;
  const janelas = comp?.consultasJanelas;
  const mensal = comp?.consultasPorMes ?? [];
  const segmentos = comp?.consultasPorSegmento ?? [];
  const totais = consolidado
    ? consolidado.consultasPorFonte.filter((f) => f.total12 !== null).map((f) => `${f.produtoNome}: ${f.total12}`)
    : (comp?.consultas12Meses != null ? [`${comp.consultas12Meses}`] : []);
  if (!janelas && !r.consultasRecentes.length && !mensal.length && !segmentos.length && !totais.length) return null;
  const quem = consolidado?.consultasPorFonte.find((f) => f.c30?.origem === 'janela')?.produtoNome;
  const maior = Math.max(0, ...(consolidado ? consolidado.consultasPorFonte.map((f) => f.total12 ?? 0) : [comp?.consultas12Meses ?? 0]));
  const n = (v: number | null) => (v === null ? 'não informado' : String(v));
  return (
    <Secao titulo="Consultas ao documento">
      {janelas && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-700">Contagem oficial por janela{quem ? ` (${quem})` : ''}</p>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([['Até 30 dias', janelas.ate30], ['31 a 60 dias', janelas.de31a60], ['61 a 90 dias', janelas.de61a90], ['Mais de 90 dias', janelas.mais90]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-200 px-3 py-2 text-center">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="text-lg font-bold tabular-nums text-slate-900">{n(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {totais.length > 0 && <p className="text-sm font-medium text-slate-800">Total em 12 meses: {totais.join('  |  ')}</p>}
      {r.consultasRecentes.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-700">
            Últimas consultas{maior > r.consultasRecentes.length ? ` (a fonte listou ${r.consultasRecentes.length} de ${maior} no período)` : ''}
          </p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {r.consultasRecentes.map((c, i) => (
              <li key={`${i}-${c.data}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 break-words"><span className="mr-2 text-xs text-slate-500">{dataBR(c.data)}</span>{c.consultante}</span>
                {c.quantidade > 1 && <span className="shrink-0 tabular-nums text-slate-700">{c.quantidade}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {mensal.length > 0 && (
        <TabelaPequena t={{
          titulo: 'Consultas por mês', colunas: ['Ano', ...MESES],
          linhas: mensal.map((l) => [String(l.ano), ...l.meses.map((v) => (v === null ? '-' : String(v)))]),
        }} />
      )}
      {segmentos.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-700">Consultas por segmento (mês, quantidade e atividade do consultante)</p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {segmentos.map((s, i) => (
              <li key={i} className="grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-3 px-3 py-1.5">
                <span className="text-xs tabular-nums text-slate-500">{mesAno(s.mes)}</span>
                <span className="min-w-0 break-words">{s.segmento}</span>
                <span className="tabular-nums font-medium">{s.quantidade ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Secao>
  );
}

// ── Comportamento comercial ────────────────────────────────────────────────────────────────────────────────
export function ComportamentoComercial({ r, tela }: { r: RelatorioCredito; tela?: ComportamentoTela | null }) {
  const c = r.comportamento;
  if (tela) {
    return (
      <Secao titulo={`Comportamento comercial${tela.fonte ? ` (${tela.fonte})` : ''}`}>
        {tela.resumo.length > 0 && <Campos pares={tela.resumo} />}
        {tela.tabelas.map((t, i) => <TabelaPequena key={i} t={{ ...t, titulo: t.titulo ?? (i === 0 ? 'Últimos 12 meses' : null) }} />)}
        {tela.relacionamento && <p className="text-sm text-slate-700">Tempo de relacionamento com fornecedores — {tela.relacionamento}</p>}
      </Secao>
    );
  }
  if (!c) return null;
  const pares = ([
    ['Última compra', c.ultimaCompraEm ? mesAnoBR(c.ultimaCompraEm) : ''],
    ['Pagamentos em dia', c.pagamentoPontualPct !== null ? pct(c.pagamentoPontualPct) : ''],
    ['Relacionamento mais antigo', c.relacionamentoMaisAntigoEm ? dataBR(c.relacionamentoMaisAntigoEm) : ''],
    ['Fornecedores que informaram', c.fontesConsultadas !== null ? String(c.fontesConsultadas) : ''],
  ] as Array<[string, string]>).filter(([, v]) => v !== '');
  return pares.length ? <Secao titulo="Comportamento comercial"><Campos pares={pares} /></Secao> : null;
}
