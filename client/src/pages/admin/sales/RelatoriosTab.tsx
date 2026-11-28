import { useState } from 'react';
import { trpc } from '../../../lib/trpc';
import { INPUT } from '../../../components/premium/admin/adminUi';
import { Aviso, Campo, Card, Consulta, TabelaResp, brlCentavos, dataSp } from './ui';

function Linha({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0 text-sm">
      <span className="text-slate-700 min-w-0">{rotulo}</span>
      <span className="font-bold tabular-nums">{valor}</span>
    </div>
  );
}

export default function RelatoriosTab() {
  const [de, setDe] = useState(() => dataSp(-29));
  const [ate, setAte] = useState(() => dataSp(0));
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(de) && /^\d{4}-\d{2}-\d{2}$/.test(ate) && de <= ate;
  const q = trpc.sales.relatorio.useQuery({ de, ate }, { enabled: valido });
  const r = q.data;

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Campo rotulo="De"><input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} className={INPUT} /></Campo>
          <Campo rotulo="Até"><input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} className={INPUT} /></Campo>
        </div>
        {!valido && <p className="text-xs text-rose-700 mt-2" role="alert">Escolha um período válido (a data inicial não pode ser depois da final).</p>}
      </Card>

      {valido && (
        <Consulta carregando={q.isLoading} erro={q.error} refazer={() => q.refetch()}>
          {r && (
            <>
              <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/30 p-4 space-y-4">
                <h3 className="text-sm font-bold text-emerald-900">Confirmado: o que o sistema mediu</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card titulo="Empresas">
                    <Linha rotulo="Pesquisadas" valor={r.empresas.pesquisadas} />
                    <Linha rotulo="Podem receber mensagem" valor={r.empresas.elegiveis} />
                    <Linha rotulo="Contatadas" valor={r.empresas.contatadas} />
                  </Card>
                  <Card titulo="Mensagens">
                    <Linha rotulo="Tentadas" valor={r.mensagens.tentadas} />
                    <Linha rotulo="Aceitas pelo servidor" valor={r.mensagens.aceitas} />
                    <Linha rotulo="Devolvidas" valor={r.mensagens.devolvidas} />
                    <Linha rotulo="Sem confirmação" valor={r.mensagens.desconhecidas} />
                    <Linha rotulo="Falhas" valor={r.mensagens.falhas} />
                  </Card>
                  <Card titulo="Respostas">
                    <Linha rotulo="De pessoas" valor={r.respostas.humanas} />
                    <Linha rotulo="Positivas" valor={r.respostas.positivas} />
                    <Linha rotulo="Pediram para sair" valor={r.respostas.pedidosDeSaida} />
                    <Linha rotulo="Reclamações" valor={r.respostas.reclamacoes} />
                  </Card>
                  <Card titulo="Vendedor virtual">
                    <Linha rotulo="Conversas" valor={r.agente.conversas} />
                    <Linha rotulo="Links de pedido gerados" valor={r.agente.linksDePedido} />
                    <Linha rotulo="Encaminhadas para você" valor={r.agente.encaminhadas} />
                    <Linha rotulo="Respostas barradas" valor={r.agente.respostasBarradas} />
                  </Card>
                </div>
              </div>

              <div className="rounded-2xl border-2 border-blue-300 bg-blue-50/30 p-4 space-y-3">
                <h3 className="text-sm font-bold text-blue-900">Associado a cupom: pedidos do site com o cupom da campanha</h3>
                <Card>
                  <Linha rotulo="Pedidos com cupom" valor={r.vendas.pedidosSiteComCupomCampanha} />
                  <Linha rotulo="Caixas" valor={r.vendas.caixasSite} />
                  <Linha rotulo="Receita do site" valor={brlCentavos(r.vendas.receitaSiteCentavos)} />
                </Card>
                <p className="text-xs text-blue-900">O cupom liga o pedido à campanha, mas não prova que foi o e-mail que vendeu.</p>
              </div>

              <div className="rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50/40 p-4 space-y-2">
                <h3 className="text-sm font-bold text-amber-900">Indício: não é prova</h3>
                {r.indicios.length === 0 ? (
                  <p className="text-sm text-amber-900">Nenhum indício no período.</p>
                ) : (
                  <ul className="list-disc pl-5 text-[13px] text-amber-900 space-y-1">{r.indicios.map((x) => <li key={x}>{x}</li>)}</ul>
                )}
                <p className="text-xs text-amber-900">O Mercado Livre não informa de onde veio o comprador. Qualquer venda lá é no máximo um indício.</p>
              </div>

              <Card titulo="Por segmento">
                <TabelaResp
                  linhas={r.porSegmento} chave={(l) => l.segmento}
                  colunas={[
                    { titulo: 'Segmento', render: (l) => l.segmento },
                    { titulo: 'Contatadas', render: (l) => l.contatadas, alinhaDireita: true },
                    { titulo: 'Respostas', render: (l) => l.respostas, alinhaDireita: true },
                    { titulo: 'Positivas', render: (l) => l.positivas, alinhaDireita: true },
                  ]}
                />
              </Card>
              <Card titulo="Por estado">
                <TabelaResp
                  linhas={r.porUf} chave={(l) => l.uf}
                  colunas={[
                    { titulo: 'UF', render: (l) => l.uf },
                    { titulo: 'Contatadas', render: (l) => l.contatadas, alinhaDireita: true },
                    { titulo: 'Respostas', render: (l) => l.respostas, alinhaDireita: true },
                    { titulo: 'Positivas', render: (l) => l.positivas, alinhaDireita: true },
                  ]}
                />
              </Card>

              <Aviso tom="slate" titulo="Rentabilidade: não calculável sem o custo industrial">
                Sem o custo de produção informado, não dá para falar em margem nem em lucro. Os números acima são de volume.
              </Aviso>
            </>
          )}
        </Consulta>
      )}
    </div>
  );
}
