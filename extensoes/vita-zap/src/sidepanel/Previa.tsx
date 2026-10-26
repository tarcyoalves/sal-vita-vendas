import { useMemo, useState } from 'react';
import { salvarCampanha, type Banco } from '../shared/banco';
import { type Campanha, criarItens, type ItemCampanha, novoId, textoDoItem, validarParaAprovar } from '../shared/campanha';
import { DIAS_SEM_REPETIR, MARCADOR_PRIMEIRO_NOME, MAX_VARIACOES } from '../shared/constantes';
import { formatarDataBr, lerDataIso, hojeNoFuso, somarDias, diferencaDias } from '../shared/datas';
import { aplicarFiltros, type Filtros, MOTIVO_SEM_MENSAGEM_MINHA, temRegistroDoAtendente, ultimoEnvioPorChave } from '../shared/filtros';
import { separarTermos } from '../shared/nomes';
import { validarModelos } from '../shared/texto';
import type { DadosLocais } from './App';
import { carregarRotinasSalvas, lerPreferencia, lerSoComConversaMinha, salvarPreferencia, salvarRotinas, salvarSoComConversaMinha } from './preferencias';
import type { CrmPainel } from './crm';
import { acharContato } from '../shared/crm-contatos';
import { CORES_ETIQUETA, FASES, type Fase } from '../shared/crm-tipos';
import { chaveDaConversa } from '../shared/crm-regras';
import { novaRotina, type Rotina } from '../shared/rotinas';
import { normalizarTexto } from '../shared/nomes';

interface Props {
  db: Banco;
  dados: DadosLocais;
  aoAprovar: (campanhaId: string) => Promise<void>;
  crm?: CrmPainel;
}

const TEXTO_EXEMPLO = `Boa tarde, ${MARCADOR_PRIMEIRO_NOME}, tudo bem? Como estão de sal por aí?`;

export function Previa({ db, dados, aoAprovar, crm }: Props) {
  const hojeBr = new Date().toLocaleDateString('pt-BR');
  const [nome, setNome] = useState(`Campanha ${hojeBr}`);
  const [contem, setContem] = useState('');
  const [incluirSemConversa, setIncluirSemConversa] = useState(true);
  const [naoContem, setNaoContem] = useState('');
  const [antesDe, setAntesDe] = useState('');
  const [depoisDe, setDepoisDe] = useState('');
  const [dias, setDias] = useState(DIAS_SEM_REPETIR);
  const [base, setBase] = useState(() => lerPreferencia('textoBase', TEXTO_EXEMPLO));
  const [variacoes, setVariacoes] = useState<string[]>(() => Array.from({ length: MAX_VARIACOES }, () => ''));
  const [itens, setItens] = useState<ItemCampanha[] | null>(null);
  const [assinaturaPrevia, setAssinaturaPrevia] = useState('');
  const [errosAprovacao, setErrosAprovacao] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [tagsSelecionadas, setTagsSelecionadas] = useState<string[]>([]);
  const [criandoTag, setCriandoTag] = useState(false);
  const [novaTagNome, setNovaTagNome] = useState('');
  const [novaTagCor, setNovaTagCor] = useState<string>(CORES_ETIQUETA[0]);
  const [erroTag, setErroTag] = useState<string | null>(null);
  const [fasesSelecionadas, setFasesSelecionadas] = useState<Fase[]>([]);
  const [aguardandoResposta, setAguardandoResposta] = useState(false);
  const [soMinha, setSoMinha] = useState(() => lerSoComConversaMinha());
  const [rotinas, setRotinas] = useState<Rotina[]>(() => carregarRotinasSalvas());
  const [rotinaAtivaId, setRotinaAtivaId] = useState<string | null>(null);
  const [modalCriarRotina, setModalCriarRotina] = useState(false);

  const [novaRotinaNome, setNovaRotinaNome] = useState('');
  const [novaRotinaDesc, setNovaRotinaDesc] = useState('');
  const [novaRotinaIcone, setNovaRotinaIcone] = useState('⚡');
  const [novaRotinaDias, setNovaRotinaDias] = useState<number | ''>(30);
  const [novaRotinaAguardando, setNovaRotinaAguardando] = useState(false);
  const [novaRotinaTextoBase, setNovaRotinaTextoBase] = useState(base);
  const [erroNovaRotina, setErroNovaRotina] = useState<string | null>(null);

  const { tagsPorChave, tagsExibicaoPorChave, catalogoTags, fasePorChave, aguardandoPorChave, comRegistroDoAtendente } = useMemo(() => {
    const mapaNorm = new Map<string, Set<string>>();
    const mapaExibicao = new Map<string, Array<{ nome: string; cor: string }>>();
    const contagemPorTag = new Map<string, number>();
    const mapaFases = new Map<string, Fase>();
    const mapaAguardando = new Map<string, boolean>();
    const comRegistro = new Set<string>();

    const etiquetasCrm = crm?.dados?.etiquetas ?? [];
    const mapaEtqPorId = new Map(etiquetasCrm.map((e) => [e.id, e]));

    for (const c of dados.contatos) {
      const tagsDoContato: Array<{ nome: string; cor: string }> = [];
      const setNorm = new Set<string>();

      if (crm?.dados) {
        const crmC = acharContato(crm.dados, { nome: c.nome });
        if (crmC) {
          if (crmC.fase) mapaFases.set(c.chave, crmC.fase);
          if (temRegistroDoAtendente(crmC)) comRegistro.add(c.chave);
          for (const etqId of crmC.etiquetas) {
            const etq = mapaEtqPorId.get(etqId);
            if (etq) {
              tagsDoContato.push({ nome: etq.nome, cor: etq.cor });
              setNorm.add(normalizarTexto(etq.nome));
            }
          }
        }

        const chaveConv = chaveDaConversa(c.nome);
        const conv = crm.dados.conversas?.[chaveConv];
        if (conv) {
          mapaAguardando.set(c.chave, conv.ultimaDeMim === true && !conv.naoLida);
        }
      }

      if (setNorm.size > 0) {
        mapaNorm.set(c.chave, setNorm);
        mapaExibicao.set(c.chave, tagsDoContato);
        for (const t of tagsDoContato) {
          const k = normalizarTexto(t.nome);
          contagemPorTag.set(k, (contagemPorTag.get(k) ?? 0) + 1);
        }
      }
    }

    const catalogo = etiquetasCrm.map((e) => ({
      id: e.id,
      nome: e.nome,
      cor: e.cor,
      contagem: contagemPorTag.get(normalizarTexto(e.nome)) ?? 0,
    }));

    return {
      tagsPorChave: mapaNorm,
      tagsExibicaoPorChave: mapaExibicao,
      catalogoTags: catalogo,
      fasePorChave: mapaFases,
      aguardandoPorChave: mapaAguardando,
      comRegistroDoAtendente: comRegistro,
    };
  }, [crm?.dados, dados.contatos]);

  const filtros: Filtros = useMemo(
    () => ({
      contem: separarTermos(contem),
      naoContem: separarTermos(naoContem),
      ultimaConversaAntesDe: lerDataIso(antesDe),
      ultimaConversaDepoisDe: lerDataIso(depoisDe),
      excluirContatadosHaDias: Math.max(DIAS_SEM_REPETIR, dias),
      incluirSemConversa,
      tags: tagsSelecionadas,
      fases: fasesSelecionadas.length > 0 ? fasesSelecionadas : undefined,
      aguardandoResposta: aguardandoResposta || undefined,
      soComMensagemMinha: soMinha || undefined,
    }),
    [contem, naoContem, antesDe, depoisDe, dias, incluirSemConversa, tagsSelecionadas, fasesSelecionadas, aguardandoResposta, soMinha],
  );

  const avaliados = useMemo(
    () =>
      aplicarFiltros(dados.contatos, filtros, {
        agora: new Date(),
        naoEnviar: new Set(dados.naoEnviar.map((n) => n.chave)),
        ultimoEnvioPorChave: ultimoEnvioPorChave(dados.envios),
        tagsPorChave,
        fasePorChave,
        aguardandoPorChave,
        comRegistroDoAtendente,
      }),
    [dados, filtros, tagsPorChave, fasePorChave, aguardandoPorChave, comRegistroDoAtendente],
  );

  const contagemPorRotina = useMemo(() => {
    const res = new Map<string, number>();
    const agora = new Date();
    const hojeIso = hojeNoFuso(agora);

    for (const r of rotinas) {
      const antesIso = r.diasSemContato && r.diasSemContato > 0 ? somarDias(hojeIso, -r.diasSemContato) : null;
      const f: Filtros = {
        contem: [],
        naoContem: [],
        ultimaConversaAntesDe: antesIso,
        ultimaConversaDepoisDe: null,
        excluirContatadosHaDias: DIAS_SEM_REPETIR,
        incluirSemConversa: !antesIso,
        tags: r.tags,
        fases: r.fases,
        aguardandoResposta: r.aguardandoResposta,
        soComMensagemMinha: soMinha || undefined,
      };
      const av = aplicarFiltros(dados.contatos, f, {
        agora,
        naoEnviar: new Set(dados.naoEnviar.map((n) => n.chave)),
        ultimoEnvioPorChave: ultimoEnvioPorChave(dados.envios),
        tagsPorChave,
        fasePorChave,
        aguardandoPorChave,
        comRegistroDoAtendente,
      });
      const qtd = av.filter((x) => x.decisao.situacao === 'incluido').length;
      res.set(r.id, qtd);
    }
    return res;
  }, [rotinas, dados, tagsPorChave, fasePorChave, aguardandoPorChave, comRegistroDoAtendente, soMinha]);
  const motivoPorChave = useMemo(() => new Map(avaliados.map((a) => [a.contato.chave, a.decisao.motivo])), [avaliados]);
  const contatoPorChave = useMemo(() => new Map(dados.contatos.map((c) => [c.chave, c])), [dados.contatos]);

  const { modelos, erros: errosTexto } = validarModelos(base, variacoes);
  const assinatura = JSON.stringify({ filtros, modelos });
  const desatualizada = itens != null && assinatura !== assinaturaPrevia;

  const incluidos = avaliados.filter((a) => a.decisao.situacao === 'incluido');
  const revisar = avaliados.filter((a) => a.decisao.situacao === 'revisar');
  const excluidos = avaliados.filter((a) => a.decisao.situacao === 'excluido');

  const motivosExclusao = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const a of excluidos) {
      contagem.set(a.decisao.motivo, (contagem.get(a.decisao.motivo) ?? 0) + 1);
    }
    return Array.from(contagem.entries()).sort((a, b) => b[1] - a[1]);
  }, [excluidos]);
  const naPrevia = new Set((itens ?? []).map((i) => i.chave));

  function gerarPrevia() {
    salvarPreferencia('textoBase', base);
    setErrosAprovacao([]);
    setItens(criarItens(incluidos.map((a) => a.contato), modelos, filtros.contem));
    setAssinaturaPrevia(assinatura);
  }

  function aplicarRotina(r: Rotina) {
    setRotinaAtivaId(r.id);
    setNome(`${r.nome} - ${hojeBr}`);

    let antesIso = '';
    let incSemConv = true;
    if (r.diasSemContato && r.diasSemContato > 0) {
      antesIso = somarDias(hojeNoFuso(new Date()), -r.diasSemContato);
      setAntesDe(antesIso);
      setDepoisDe('');
      incSemConv = false;
      setIncluirSemConversa(false);
    } else {
      setAntesDe('');
      setDepoisDe('');
      incSemConv = true;
      setIncluirSemConversa(true);
    }

    setFasesSelecionadas(r.fases ?? []);
    setTagsSelecionadas(r.tags ?? []);
    setAguardandoResposta(r.aguardandoResposta ?? false);

    setBase(r.textoBase);
    salvarPreferencia('textoBase', r.textoBase);
    const novasVar = Array.from({ length: MAX_VARIACOES }, (_, i) => r.variacoes[i] ?? '');
    setVariacoes(novasVar);

    setContem('');
    setNaoContem('');

    const filtrosRotina: Filtros = {
      contem: [],
      naoContem: [],
      ultimaConversaAntesDe: antesIso ? antesIso : null,
      ultimaConversaDepoisDe: null,
      excluirContatadosHaDias: DIAS_SEM_REPETIR,
      incluirSemConversa: incSemConv,
      tags: r.tags,
      fases: r.fases,
      aguardandoResposta: r.aguardandoResposta,
      soComMensagemMinha: soMinha || undefined,
    };
    const { modelos: mods } = validarModelos(r.textoBase, novasVar);
    const av = aplicarFiltros(dados.contatos, filtrosRotina, {
      agora: new Date(),
      naoEnviar: new Set(dados.naoEnviar.map((n) => n.chave)),
      ultimoEnvioPorChave: ultimoEnvioPorChave(dados.envios),
      tagsPorChave,
      fasePorChave,
      aguardandoPorChave,
      comRegistroDoAtendente,
    });
    const contatosInc = av.filter((x) => x.decisao.situacao === 'incluido').map((x) => x.contato);
    setItens(criarItens(contatosInc, mods, []));
    setAssinaturaPrevia(JSON.stringify({ filtros: filtrosRotina, modelos: mods }));
    setErrosAprovacao([]);
  }

  function desativarRotina() {
    setRotinaAtivaId(null);
    setAntesDe('');
    setDepoisDe('');
    setFasesSelecionadas([]);
    setAguardandoResposta(false);
    setItens(null);
  }

  function removerRotinaCustom(id: string) {
    const atualizadas = rotinas.filter((r) => r.id !== id);
    salvarRotinas(atualizadas);
    setRotinas(atualizadas);
    if (rotinaAtivaId === id) setRotinaAtivaId(null);
  }

  function incluirManual(chave: string) {
    const a = revisar.find((x) => x.contato.chave === chave) ?? excluidos.find((x) => x.contato.chave === chave && x.decisao.motivo === MOTIVO_SEM_MENSAGEM_MINHA);
    if (!a || !itens || a.contato.duplicado || naPrevia.has(chave)) return;
    setItens([...itens, ...criarItens([a.contato], modelos, filtros.contem)]);
  }

  function incluirTodosRevisar() {
    if (!itens) return;
    const novos = revisar
      .filter((a) => !a.contato.duplicado && !naPrevia.has(a.contato.chave))
      .map((a) => a.contato);
    if (novos.length === 0) return;
    setItens([...itens, ...criarItens(novos, modelos, filtros.contem)]);
  }

  function atualizarItem(chave: string, mudanca: Partial<ItemCampanha>) {
    setItens((atual) => (atual ?? []).map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));
  }

  async function aprovar() {
    if (!itens) return;
    const erros = [...errosTexto, ...validarParaAprovar({ itens, modelos })];
    setErrosAprovacao(erros);
    if (erros.length > 0 || desatualizada) return;
    setSalvando(true);
    try {
      const agora = new Date();
      const campanha: Campanha = {
        id: novoId(agora),
        nome: nome.trim() || `Campanha ${hojeBr}`,
        criadaEm: agora.toISOString(),
        aprovadaEm: agora.toISOString(),
        termoBusca: contem,
        filtros,
        modelos,
        status: 'pausada',
        motivoPausa: 'Aprovada. Clique em Iniciar quando estiver pronto.',
        itens,
        problemasSeguidos: 0,
        ultimoEnvioEm: null,
        intervaloAtualSeg: null,
      };
      await salvarCampanha(db, campanha);
      setItens(null);
      await aoAprovar(campanha.id);
    } finally {
      setSalvando(false);
    }
  }

  if (dados.contatos.length === 0) {
    return <p className="ajuda">Faça a varredura primeiro (aba 1).</p>;
  }

  return (
    <section>
      <div className="cartao" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, color: '#166534', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <span>⚡ Rotinas Rápidas</span>
            <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>1 clique</span>
          </h3>
          <button
            type="button"
            className="pequeno"
            onClick={() => setModalCriarRotina(!modalCriarRotina)}
            style={{ fontSize: 11, padding: '2px 8px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
          >
            {modalCriarRotina ? 'Fechar' : '+ Nova Rotina'}
          </button>
        </div>
        <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#15803d' }}>
          Execute rotinas automáticas de vendas com filtros e mensagens prontas:
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {rotinas.map((r) => {
            const qtd = contagemPorRotina.get(r.id) ?? 0;
            const ativa = rotinaAtivaId === r.id;
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: ativa ? '#166534' : '#fff',
                  color: ativa ? '#fff' : '#166534',
                  border: `1px solid ${ativa ? '#166534' : '#86efac'}`,
                  borderRadius: 6,
                  overflow: 'hidden',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                <button
                  type="button"
                  onClick={() => aplicarRotina(r)}
                  title={r.descricao}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <span>{r.icone}</span>
                  <span>{r.nome}</span>
                  <span
                    style={{
                      fontSize: 11,
                      background: ativa ? '#15803d' : '#dcfce7',
                      color: ativa ? '#fff' : '#166534',
                      padding: '1px 6px',
                      borderRadius: 10,
                      fontWeight: 700,
                    }}
                  >
                    {qtd}
                  </span>
                </button>
                {!r.padrao && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removerRotinaCustom(r.id);
                    }}
                    title="Excluir rotina"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: ativa ? '#fff' : '#991b1b',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {rotinaAtivaId && (
          <div style={{ marginTop: 10, padding: '8px 10px', background: '#fff', border: '1px solid #86efac', borderRadius: 6, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 700, color: '#166534' }}>
                {rotinas.find((x) => x.id === rotinaAtivaId)?.icone} {rotinas.find((x) => x.id === rotinaAtivaId)?.nome} ativa:
              </span>{' '}
              <span style={{ color: '#374151' }}>{rotinas.find((x) => x.id === rotinaAtivaId)?.descricao}</span>
            </div>
            <button
              type="button"
              onClick={() => desativarRotina()}
              style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Limpar rotina
            </button>
          </div>
        )}
      </div>

      {modalCriarRotina && (
        <div className="cartao" style={{ background: '#f8fafc', border: '2px solid #16a34a', padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4 style={{ margin: 0, color: '#166534', fontSize: 13, fontWeight: 700 }}>+ Nova Rotina de Vendas</h4>
            <button
              type="button"
              className="pequeno"
              onClick={() => {
                setModalCriarRotina(false);
                setErroNovaRotina(null);
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}
            >
              ✕
            </button>
          </div>

          <label style={{ display: 'block', marginBottom: 6 }}>
            Nome da rotina
            <input
              type="text"
              placeholder="ex: Cobrança 15 dias, Reativação..."
              value={novaRotinaNome}
              onChange={(e) => setNovaRotinaNome(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </label>

          <div className="linha2" style={{ marginBottom: 6 }}>
            <label>
              Ícone
              <select value={novaRotinaIcone} onChange={(e) => setNovaRotinaIcone(e.target.value)}>
                {['⚡', '🔄', '⏳', '📦', '💬', '🎯', '💰', '⭐'].map((ic) => (
                  <option key={ic} value={ic}>{ic}</option>
                ))}
              </select>
            </label>
            <label>
              Dias sem contato (opcional)
              <input
                type="number"
                placeholder="ex: 30"
                value={novaRotinaDias}
                onChange={(e) => setNovaRotinaDias(e.target.value ? Number(e.target.value) : '')}
              />
            </label>
          </div>

          <label style={{ display: 'block', marginBottom: 6 }}>
            Descrição rápida
            <input
              type="text"
              placeholder="ex: Follow-up de cotações paradas"
              value={novaRotinaDesc}
              onChange={(e) => setNovaRotinaDesc(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </label>

          <label className="check" style={{ margin: '8px 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={novaRotinaAguardando}
              onChange={(e) => setNovaRotinaAguardando(e.target.checked)}
            />
            <span>Apenas se estiver aguardando resposta (atendente falou por último)</span>
          </label>

          <label style={{ display: 'block', marginBottom: 6 }}>
            Texto base da mensagem
            <textarea
              rows={2}
              value={novaRotinaTextoBase}
              onChange={(e) => setNovaRotinaTextoBase(e.target.value)}
              placeholder={`ex: Olá, ${MARCADOR_PRIMEIRO_NOME}, tudo bem?`}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </label>

          {erroNovaRotina && <p className="erro" style={{ margin: '4px 0' }}>{erroNovaRotina}</p>}

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              type="button"
              className="primario pequeno"
              onClick={() => {
                if (!novaRotinaNome.trim()) {
                  setErroNovaRotina('Digite o nome da rotina.');
                  return;
                }
                if (!novaRotinaTextoBase.trim()) {
                  setErroNovaRotina('Digite o texto base da mensagem.');
                  return;
                }
                const criada = novaRotina({
                  nome: novaRotinaNome.trim(),
                  descricao: novaRotinaDesc.trim() || 'Rotina personalizada',
                  icone: novaRotinaIcone,
                  diasSemContato: typeof novaRotinaDias === 'number' ? novaRotinaDias : undefined,
                  fases: fasesSelecionadas.length > 0 ? fasesSelecionadas : undefined,
                  tags: tagsSelecionadas.length > 0 ? tagsSelecionadas : undefined,
                  aguardandoResposta: novaRotinaAguardando || undefined,
                  textoBase: novaRotinaTextoBase.trim(),
                  variacoes: [],
                });
                const atualizadas = [criada, ...rotinas];
                salvarRotinas(atualizadas);
                setRotinas(atualizadas);
                setModalCriarRotina(false);
                setErroNovaRotina(null);
                setNovaRotinaNome('');
                setNovaRotinaDesc('');
                aplicarRotina(criada);
              }}
            >
              Salvar e usar rotina
            </button>
            <button
              type="button"
              className="pequeno"
              onClick={() => {
                setModalCriarRotina(false);
                setErroNovaRotina(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      <div className="cartao">
        <h3>Filtros</h3>
        <label>
          Nome contém (separe por vírgula)
          <input value={contem} onChange={(e) => setContem(e.target.value)} />
        </label>
        <label>
          Nome NÃO contém
          <input value={naoContem} onChange={(e) => setNaoContem(e.target.value)} placeholder="ex.: FORNECEDOR" />
        </label>
        <label className="check" style={{ margin: '8px 0', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={incluirSemConversa}
            onChange={(e) => setIncluirSemConversa(e.target.checked)}
          />
          <span>Incluir contatos salvos da agenda (mesmo se a busca do WhatsApp não exibir a data da conversa)</span>
        </label>

        <div className="linha2">
          <label>
            Última conversa até o dia (inclusive)
            <input type="date" value={antesDe} onChange={(e) => setAntesDe(e.target.value)} />
          </label>
          <label>
            Última conversa a partir de (inclusive)
            <input type="date" value={depoisDe} onChange={(e) => setDepoisDe(e.target.value)} />
          </label>
        </div>
        <label>
          Excluir quem recebeu campanha há menos de (dias, mínimo {DIAS_SEM_REPETIR})
          <input
            type="number"
            min={DIAS_SEM_REPETIR}
            value={dias}
            onChange={(e) => setDias(Math.max(DIAS_SEM_REPETIR, Number(e.target.value) || DIAS_SEM_REPETIR))}
          />
        </label>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--borda)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Tags do CRM (opcional)</span>
            <button
              type="button"
              className="pequeno"
              onClick={() => setCriandoTag(!criandoTag)}
              style={{ fontSize: 11, padding: '2px 8px' }}
            >
              {criandoTag ? 'Cancelar' : '+ Nova tag'}
            </button>
          </div>

          {criandoTag && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap', padding: 8, background: '#f8fafc', borderRadius: 6, border: '1px solid var(--borda)' }}>
              <input
                type="text"
                placeholder="Nome da tag (ex: Ativo, Cotação)..."
                value={novaTagNome}
                onChange={(e) => setNovaTagNome(e.target.value)}
                style={{ flex: 1, minWidth: 140, padding: '3px 8px', fontSize: 12 }}
              />
              <select
                aria-label="Cor da nova tag"
                value={novaTagCor}
                onChange={(e) => setNovaTagCor(e.target.value)}
                style={{ padding: '3px', fontSize: 12 }}
              >
                {CORES_ETIQUETA.map((c) => (
                  <option key={c} value={c} style={{ background: c, color: '#fff' }}>
                    Cor
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="primario pequeno"
                disabled={!novaTagNome.trim()}
                onClick={async () => {
                  if (!crm || !novaTagNome.trim()) return;
                  setErroTag(null);
                  const res = await crm.fazer((r) => r.criarEtiqueta(novaTagNome.trim(), novaTagCor));
                  if ('erro' in res) {
                    setErroTag(res.erro);
                  } else {
                    setNovaTagNome('');
                    setCriandoTag(false);
                    setTagsSelecionadas((atuais) => [...atuais, res.etiqueta.nome]);
                  }
                }}
              >
                Salvar tag
              </button>
              {erroTag && <p className="erro" style={{ width: '100%', margin: '4px 0 0 0', fontSize: 11 }}>{erroTag}</p>}
            </div>
          )}

          {catalogoTags.length === 0 ? (
            <p className="ajuda" style={{ fontSize: 12, margin: '4px 0' }}>
              Nenhuma tag cadastrada ainda. Clique em <b>+ Nova tag</b> acima para criar.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {catalogoTags.map((t) => {
                const ativa = tagsSelecionadas.includes(t.nome);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (ativa) setTagsSelecionadas(tagsSelecionadas.filter((x) => x !== t.nome));
                      else setTagsSelecionadas([...tagsSelecionadas, t.nome]);
                    }}
                    style={{
                      background: ativa ? t.cor : '#f1f5f9',
                      color: ativa ? '#fff' : '#334155',
                      border: ativa ? `1px solid ${t.cor}` : '1px solid #cbd5e1',
                      borderRadius: 14,
                      padding: '2px 9px',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>{t.nome}</span>
                    <span style={{ opacity: 0.8, fontSize: 10 }}>({t.contagem})</span>
                    {ativa && <span>✓</span>}
                  </button>
                );
              })}
              {tagsSelecionadas.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTagsSelecionadas([])}
                  style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Limpar filtro de tags
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--borda)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Fase do Funil do CRM (opcional)</span>
            {fasesSelecionadas.length > 0 && (
              <button
                type="button"
                onClick={() => setFasesSelecionadas([])}
                style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Limpar fases
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FASES.map((f) => {
              const ativa = fasesSelecionadas.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setFasesSelecionadas((atuais) =>
                      atuais.includes(f.id) ? atuais.filter((x) => x !== f.id) : [...atuais, f.id],
                    );
                  }}
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 12,
                    border: `1px solid ${f.cor}`,
                    background: ativa ? f.cor : '#fff',
                    color: ativa ? '#fff' : f.cor,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: ativa ? '#fff' : f.cor }} />
                  <span>{f.rotulo}</span>
                  {ativa && <span>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        <label className="check" style={{ margin: '10px 0 0 0', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={aguardandoResposta}
            onChange={(e) => setAguardandoResposta(e.target.checked)}
          />
          <span>Apenas quem está aguardando resposta (você falou por último)</span>
        </label>
        <label className="check" style={{ margin: '8px 0 0 0', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={soMinha}
            onChange={(e) => {
              setSoMinha(e.target.checked);
              salvarSoComConversaMinha(e.target.checked);
            }}
          />
          <span>Só contatos com conversa já feita por mim (atendente)</span>
        </label>
        <p className="info">
          {incluidos.length} entram · {revisar.length} para revisar · {excluidos.length} fora
        </p>
        {incluidos.length === 0 && motivosExclusao.length > 0 && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
            <strong>Por que nenhum contato entrou ({excluidos.length} fora):</strong>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {motivosExclusao.slice(0, 3).map(([motivo, qtd]) => (
                <li key={motivo}><b>{qtd}</b> contato{qtd > 1 ? 's' : ''}: <i>{motivo}</i></li>
              ))}
            </ul>
            {contem.trim() !== '' && motivosExclusao.some(([m]) => m.includes('não contém')) && (
              <p style={{ margin: '6px 0 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span>👉 Seus contatos não têm "{contem}" no nome.</span>
                <button
                  type="button"
                  style={{ fontSize: 11, padding: '2px 8px', cursor: 'pointer', background: '#fff', border: '1px solid #dc2626', borderRadius: 4, color: '#dc2626', fontWeight: 600 }}
                  onClick={() => setContem('')}
                >
                  Limpar filtro de nome
                </button>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="cartao">
        <h3>Texto</h3>
        <p className="ajuda">
          Use {MARCADOR_PRIMEIRO_NOME} para o primeiro nome. Sem link na primeira mensagem. Cada contato recebe um dos textos, sorteado.
        </p>
        <label>
          Texto base
          <textarea rows={3} value={base} onChange={(e) => setBase(e.target.value)} />
        </label>
        {variacoes.map((v, i) => (
          <label key={i}>
            Variação {i + 1} (opcional)
            <textarea rows={2} value={v} onChange={(e) => setVariacoes(variacoes.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
        {errosTexto.map((e) => (
          <p key={e} className="erro">
            {e}
          </p>
        ))}
        <label>
          Nome da campanha
          <input value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        {incluidos.length === 0 && (
          <p className="aviso" style={{ marginBottom: 8, fontSize: 12 }}>
            O botão <b>Gerar prévia</b> só libera quando pelo menos 1 contato entra na campanha. Ajuste ou limpe os filtros acima.
          </p>
        )}
        <button type="button" className="primario" onClick={gerarPrevia} disabled={errosTexto.length > 0 || incluidos.length === 0}>
          {itens ? 'Gerar prévia de novo (novo sorteio)' : 'Gerar prévia'}
        </button>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="pequeno"
            onClick={() => {
              setNovaRotinaNome(`Rotina ${hojeBr}`);
              setNovaRotinaTextoBase(base);
              if (antesDe) {
                const diff = diferencaDias(hojeNoFuso(new Date()), antesDe);
                if (diff > 0) setNovaRotinaDias(diff);
              }
              setNovaRotinaAguardando(aguardandoResposta);
              setModalCriarRotina(true);
            }}
            style={{ fontSize: 11, background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', fontWeight: 600, borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}
          >
            💾 Salvar estes filtros e mensagens como uma nova Rotina
          </button>
        </div>
        <button type="button" style={{ display: 'none' }}>
        </button>
      </div>

      {itens && (
        <div className="cartao">
          <h3>Prévia · {itens.length} contatos</h3>
          {desatualizada && <p className="aviso">Filtros ou textos mudaram depois da prévia. Gere a prévia de novo antes de aprovar.</p>}
          <ul className="lista">
            {itens.map((i, idx) => (
              <li key={i.chave}>
                <div className="lista-topo">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--suave)', minWidth: 22 }}>
                      #{idx + 1}
                    </span>
                    <b>{i.nome}</b>
                    {tagsExibicaoPorChave.get(i.chave)?.map((t) => (
                      <span key={t.nome} style={{ fontSize: 10, background: t.cor, color: '#fff', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>
                        {t.nome}
                      </span>
                    ))}
                    {crm && (
                      <select
                        aria-label={`Tag para ${i.nome}`}
                        value=""
                        onChange={async (e) => {
                          const etqId = e.target.value;
                          if (!etqId) return;
                          await crm.fazer((r) => r.alternarEtiqueta({ nome: i.nome }, etqId));
                        }}
                        style={{ fontSize: 10, padding: '1px 4px', borderRadius: 4, border: '1px solid var(--borda)', background: '#fff', cursor: 'pointer', color: 'var(--suave)' }}
                      >
                        <option value="">+ tag</option>
                        {catalogoTags.map((t) => (
                          <option key={t.id} value={t.id}>
                            {tagsExibicaoPorChave.get(i.chave)?.some((x) => x.nome === t.nome) ? `✓ ${t.nome}` : t.nome}
                          </option>
                        ))}
                      </select>
                    )}
                    {contatoPorChave.get(i.chave)?.ultimaConversa && (
                      <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                        {formatarDataBr(contatoPorChave.get(i.chave)!.ultimaConversa)}
                      </span>
                    )}
                  </div>
                  <button type="button" className="pequeno" onClick={() => setItens(itens.filter((x) => x.chave !== i.chave))}>
                    Remover
                  </button>
                </div>
                <small>{motivoPorChave.get(i.chave)}</small>
                <label className="inline">
                  Primeiro nome
                  <input value={i.primeiroNome} onChange={(e) => atualizarItem(i.chave, { primeiroNome: e.target.value })} />
                </label>
                <div className="balao">{textoDoItem(i)}</div>
              </li>
            ))}
          </ul>
          {errosAprovacao.map((e) => (
            <p key={e} className="erro">
              {e}
            </p>
          ))}
          <button type="button" className="primario" onClick={() => void aprovar()} disabled={salvando || desatualizada || itens.length === 0}>
            Aprovar campanha ({itens.length})
          </button>
        </div>
      )}

      {revisar.length > 0 && (
        <details className="cartao" open>
          <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
            <span>Revisar ({revisar.length}) — sem data na lista da busca</span>
            {itens && (
              <button
                type="button"
                className="pequeno"
                style={{ fontSize: 11, padding: '2px 8px', fontWeight: 600, background: '#0288d1', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  incluirTodosRevisar();
                }}
              >
                + Incluir todos ({revisar.length})
              </button>
            )}
          </summary>
          <ul className="lista">
            {revisar.map((a) => (
              <li key={a.contato.chave}>
                <div className="lista-topo">
                  <b>{a.contato.nome}</b>
                  {/* Nome repetido não pode entrar: não há como saber qual conversa abrir. */}
                  {itens && !a.contato.duplicado && !naPrevia.has(a.contato.chave) && (
                    <button type="button" className="pequeno" onClick={() => incluirManual(a.contato.chave)}>
                      Incluir mesmo assim
                    </button>
                  )}
                </div>
                <small>
                  {a.decisao.motivo} · lista mostrava "{a.contato.rotuloData ?? '—'}"
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="cartao" open={incluidos.length === 0}>
        <summary>Fora da campanha ({excluidos.length})</summary>
        <ul className="lista">
          {excluidos.map((a) => (
            <li key={a.contato.chave}>
              <b>{a.contato.nome}</b> <small>— {a.decisao.motivo}</small>
              {a.contato.ultimaConversa && <small> · {formatarDataBr(a.contato.ultimaConversa)}</small>}
              {itens && a.decisao.motivo === MOTIVO_SEM_MENSAGEM_MINHA && !a.contato.duplicado && !naPrevia.has(a.contato.chave) && (
                <>
                  {' '}
                  <button type="button" className="pequeno" onClick={() => incluirManual(a.contato.chave)}>
                    Incluir mesmo assim
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
