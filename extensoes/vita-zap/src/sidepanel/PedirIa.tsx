// Painel "Pedir à IA" (v0.7.57): o dono escreve o que quer achar nas conversas ("clientes a quem perguntei sobre estoque e que não
// responderam"). A IA entende o pedido e mostra o PLANO; o dono confirma/edita; só então a extensão LÊ as conversas (só leitura)
// e a IA diz quais correspondem. O resultado é uma lista para REVISÃO com o motivo de cada um. NADA sai sozinho daqui:
//  - "Enviar mensagem" monta uma PRÉVIA obrigatória (o texto exato de cada um) e, aprovada, cria uma campanha COMUM que o dono
//    inicia na aba "3. Envio": o MESMO Executor, com toda a política (teto, horário, intervalo, freio, "Não enviar mais",
//    conversa conferida, trava de agendamento do CRM). Este painel não tem caminho próprio de clique.
//  - "Agendar no CRM" cria um lembrete; "Não enviar mais" bloqueia para sempre; "Ignorar" só tira da lista.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Banco, lerConfigFollowup } from '../shared/banco';
import { formatarDataBr, hojeNoFuso } from '../shared/datas';
import { type ModoCobranca, MAX_ESTILO, errosDoRascunho, rotuloOrigem } from '../shared/followup-estilo';
import {
  AVISO_HISTORICO,
  DIAS_AGENDAR_MAX,
  DIAS_AGENDAR_MIN,
  DIAS_AGENDAR_PADRAO,
  MAX_PEDIDO_TEXTO,
  PERIODO_MAX,
  PERIODO_MIN,
  VALIDADE_LEITURA_PEDIDO_MS,
  descreverPlano,
  errosDoPlano,
  leituraVelha,
  normalizarPlano,
  normalizarTermos,
  podeReceberMensagem,
  resumoDaRodada,
  type EstadoPedidos,
  type ItemPedido,
  type PlanoPedido,
  type QuemFalou,
} from '../shared/pedido-ia';
import type { DadosLocais } from './App';
import type { CrmPainel } from './crm';
import { EditorDeTextos } from './MensagemCobranca';
import { MotorPedido, type PreviaEnvio } from './pedido-motor';
import { OrientacoesIa } from './OrientacoesIa';
import { lerPreferencia, salvarPreferencia } from './preferencias';
import { assinarTrava, donoDaTrava, liberar, ROTULO_DONO, tentarTravar } from './trava-whatsapp';
import { useTrava } from './trava';
import { pedir } from './whatsapp';

interface Props {
  db: Banco;
  crm: CrmPainel;
  dados: DadosLocais;
  /** A campanha foi criada: o App abre a aba "3. Envio" nela (como a Prévia faz). */
  aoAprovar: (campanhaId: string) => Promise<void>;
  ativa?: boolean;
}

const EXEMPLOS_PEDIDO = [
  'Filtre os clientes a quem perguntei sobre estoque e que não responderam.',
  'Quem pediu preço nos últimos 15 dias e eu não respondi.',
  'Clientes que disseram que voltam a comprar depois do mês.',
];

const SUGESTOES_ENVIO: readonly string[] = [
  'Oi, {nome}! Passando para saber se você viu a minha pergunta sobre o estoque. Fico à disposição.',
  '{nome}, tudo bem? Conseguiu ver como está o estoque por aí? Qualquer coisa me chama.',
];

const lerTextosEnvio = (): string[] => {
  try {
    const v = JSON.parse(lerPreferencia('pedidoTextos', '[]')) as unknown;
    const l = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 10) : [];
    return l.length > 0 ? l : [''];
  } catch {
    return [''];
  }
};

const dataCurta = (iso: string | null | undefined): string => (iso ? formatarDataBr(hojeNoFuso(new Date(iso))).slice(0, 5) : '');

interface PlanoEditavel {
  periodo: string;
  quem: QuemFalou;
  respondeu: 'sim' | 'nao' | 'tanto_faz';
  assunto: string;
  termos: string;
}

const paraEditavel = (p: PlanoPedido): PlanoEditavel => ({ periodo: String(p.periodoDias), quem: p.quemFalouPorUltimo, respondeu: p.respondeu === true ? 'sim' : p.respondeu === false ? 'nao' : 'tanto_faz', assunto: p.assunto, termos: p.termosNomeContato.join(', ') });
const doEditavel = (e: PlanoEditavel): PlanoPedido => normalizarPlano({ periodoDias: Number(e.periodo), quemFalouPorUltimo: e.quem, respondeu: e.respondeu === 'sim' ? true : e.respondeu === 'nao' ? false : null, assunto: e.assunto, termosNomeContato: normalizarTermos(e.termos) });

export function PedirIa({ db, crm, dados, aoAprovar, ativa }: Props) {
  const trava = useTrava(db, crm);
  const dadosCrm = useRef(crm.dados);
  dadosCrm.current = crm.dados;
  const contatosRef = useRef(dados.contatos);
  contatosRef.current = dados.contatos;
  const pararRef = useRef(false);

  const motor = useMemo(
    () =>
      new MotorPedido({
        db,
        pedir,
        ia: crm.repo,
        travar: trava ? (contatos, forcar) => trava.varios(contatos, forcar) : async (contatos) => contatos.map(() => ({ tipo: 'indisponivel' as const, motivo: 'sem CRM neste painel' })),
        criarLembrete: async (nome, venceEm, agora) => {
          const r = await crm.repo.criarLembrete({ ref: { nome }, venceEm }, agora);
          return r.ok ? null : r.erro;
        },
        agora: () => new Date(),
        aleatorio: Math.random,
        esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
      }),
    [db, crm.repo, trava],
  );

  const [estado, setEstado] = useState<EstadoPedidos | null>(null);
  const [texto, setTexto] = useState('');
  const [plano, setPlano] = useState<PlanoEditavel | null>(null);
  const [perguntas, setPerguntas] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dono, setDono] = useState(donoDaTrava());
  const [diasAgendar, setDiasAgendar] = useState(String(DIAS_AGENDAR_PADRAO));
  // Envio (prévia obrigatória)
  const [paraEnviar, setParaEnviar] = useState<string[] | null>(null);
  const [modo, setModo] = useState<ModoCobranca>('meus_textos');
  const [textos, setTextos] = useState<string[]>(lerTextosEnvio);
  const [estilo, setEstilo] = useState('');
  const [previa, setPrevia] = useState<PreviaEnvio | null>(null);

  const recarregar = useCallback(async () => setEstado(await motor.carregar()), [motor]);
  useEffect(() => {
    void recarregar();
  }, [recarregar, ativa]);
  useEffect(() => assinarTrava(() => setDono(donoDaTrava())), []);
  useEffect(() => {
    let vivo = true;
    void lerConfigFollowup(db).then((c) => {
      if (vivo) setEstilo((atual) => (atual === '' ? c.estilo : atual));
    });
    return () => {
      vivo = false;
    };
  }, [db]);

  const ultimo = estado?.ultimo ?? null;
  const agora = new Date();
  const bloqueadoPor = dono && dono !== 'pedido' ? ROTULO_DONO[dono] : null;
  const trabalhando = ocupado != null;

  async function entender(t: string = texto) {
    setAviso(null);
    setInfo(null);
    setPrevia(null);
    setParaEnviar(null);
    const limpo = t.replace(/\s+/g, ' ').trim();
    if (limpo.length < 3) {
      setAviso('Escreva o que você quer encontrar nas conversas.');
      return;
    }
    setOcupado('A IA está entendendo o pedido…');
    try {
      const r = await motor.interpretar(limpo);
      if (!r.ok) {
        setPlano(null);
        setAviso(r.mensagem);
        return;
      }
      setPlano(paraEditavel(r.valor.plano));
      setPerguntas(r.valor.perguntas);
    } finally {
      setOcupado(null);
    }
  }

  async function buscar() {
    if (!plano) return;
    const p = doEditavel(plano);
    const erros = errosDoPlano(p);
    if (erros.length > 0) {
      setAviso(`Ajuste o plano: ${erros.join('; ')}.`);
      return;
    }
    const d0 = donoDaTrava();
    if (d0 && d0 !== 'pedido') {
      setAviso(`Agora não: ${ROTULO_DONO[d0]}.`);
      return;
    }
    if (!tentarTravar('pedido')) return;
    pararRef.current = false;
    setAviso(null);
    setInfo(null);
    setPrevia(null);
    setParaEnviar(null);
    try {
      setOcupado('Escolhendo as conversas…');
      const r = await motor.rodar(texto.trim() || p.assunto, p, contatosRef.current, { parar: () => pararRef.current, aoProgredir: setOcupado });
      await recarregar();
      for (const a of r.avisos) setAviso((x) => (x ? `${x} ${a}` : a));
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
      liberar('pedido');
    }
  }

  const acao = (fn: () => Promise<void>) => () => void fn().then(recarregar);

  const marcados = (ultimo?.itens ?? []).filter((i) => i.estado === 'aberto' && i.marcado);
  const abertos = (ultimo?.itens ?? []).filter((i) => i.estado === 'aberto');

  async function agendar(chaves: string[]) {
    const r = await motor.agendar(chaves, diasAgendar);
    setInfo(`${r.feitos} agendamento(s) criado(s) no CRM. Nenhuma mensagem foi enviada.`);
    setAviso(r.erros.length > 0 ? `Não agendei: ${r.erros.map((e) => `${e.nome} (${e.erro})`).join('; ')}` : null);
    await recarregar();
  }

  async function naoEnviar(chaves: string[]) {
    if (chaves.length === 0) return;
    if (!window.confirm(`Marcar ${chaves.length} contato(s) como "Não enviar mais"? Eles nunca mais recebem mensagem por campanha, cobrança ou reativação.`)) return;
    const n = await motor.naoEnviarMais(chaves);
    setInfo(`${n} contato(s) marcados como "Não enviar mais".`);
    await recarregar();
  }

  function abrirEnvio(chaves: string[]) {
    setPrevia(null);
    setParaEnviar(chaves);
    setAviso(null);
    setInfo(null);
  }

  const errosTextos = errosDoRascunho({ modo, textos1: textos, textos2: [], estilo });

  async function montarPrevia() {
    if (!paraEnviar) return;
    salvarPreferencia('pedidoTextos', JSON.stringify(textos.filter((t) => t.trim() !== '')));
    setOcupado('Montando a prévia…');
    try {
      setPrevia(await motor.montarPrevia(paraEnviar, { modo, textos, estilo }));
    } finally {
      setOcupado(null);
    }
  }

  async function aprovar() {
    if (!previa) return;
    setOcupado('Criando a campanha…');
    try {
      const c = await motor.criarCampanha(previa);
      if (!c) {
        setAviso('Não criei a campanha: a seleção mudou desde a prévia. Monte a prévia de novo.');
        return;
      }
      setParaEnviar(null);
      setPrevia(null);
      await recarregar();
      await aoAprovar(c.id);
    } finally {
      setOcupado(null);
    }
  }

  const itemLinha = (i: ItemPedido) => {
    const pode = podeReceberMensagem(i, agora);
    const velho = leituraVelha(i, agora);
    return (
      <li key={i.chave} data-chave={i.chave}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <input type="checkbox" aria-label={`Marcar ${i.nome}`} checked={i.marcado} disabled={i.estado !== 'aberto'} onChange={(e) => void motor.marcar(i.chave, e.target.checked).then(recarregar)} />
          <span>
            <b>{i.nome}</b> <small>{i.ultimaConversa ? `última conversa ${dataCurta(`${i.ultimaConversa}T12:00:00Z`)} · ` : ''}{i.revisar ? 'revisar' : `confiança ${i.confianca}`}</small>
          </span>
        </label>
        <div className="ajuda">{i.motivo}</div>
        {i.pediuParaSair && <div className="aviso">Este cliente pediu para não receber mais mensagens: só "Não enviar mais".</div>}
        {i.trava.tipo === 'agendado' && <div className="aviso">Agendado para {dataCurta(i.trava.ate)} no CRM: fica de fora (o agendamento prevalece).</div>}
        {i.trava.tipo === 'indisponivel' && <div className="aviso">Não consegui conferir os agendamentos do CRM: confira antes de enviar ({i.trava.motivo}).</div>}
        {velho && i.estado === 'aberto' && <div className="aviso">Leitura de mais de {Math.round(VALIDADE_LEITURA_PEDIDO_MS / 3_600_000)} horas: rode o pedido de novo antes de enviar.</div>}
        {i.estado !== 'aberto' ? (
          <div className="ajuda">{{ na_campanha: 'Na campanha (aba 3. Envio)', agendado: 'Agendado no CRM', nao_enviar: 'Não enviar mais', ignorado: 'Ignorado', aberto: '' }[i.estado]}</div>
        ) : (
          <div className="botoes">
            <button type="button" className="pequeno" disabled={!pode.ok} title={pode.ok ? 'Monta a prévia do texto; nada é enviado agora.' : pode.motivo} onClick={() => abrirEnvio([i.chave])}>Enviar mensagem</button>
            <button type="button" className="pequeno" disabled={i.trava.tipo === 'agendado'} onClick={() => void agendar([i.chave])}>Agendar no CRM ({diasAgendar} d)</button>
            <button type="button" className="pequeno perigo" onClick={() => void naoEnviar([i.chave])}>Não enviar mais</button>
            <button type="button" className="pequeno" onClick={acao(() => motor.ignorar([i.chave]))}>Ignorar</button>
          </div>
        )}
      </li>
    );
  };

  if (!estado) return <p className="carregando">Carregando…</p>;

  return (
    <section>
      <OrientacoesIa crm={crm} />
      <div className="cartao">
        <h3>Pedir à IA</h3>
        <p className="ajuda">
          Escreva em português o que você quer achar nas conversas do WhatsApp. A IA entende o pedido, mostra o <b>plano</b> para você conferir, e só então a extensão <b>lê</b> as conversas (só leitura) e a IA diz quais correspondem.
          O resultado é uma <b>lista para revisão</b>: nada é enviado sozinho. {AVISO_HISTORICO}
        </p>
        <textarea
          aria-label="Pedido para a IA"
          value={texto}
          rows={3}
          maxLength={MAX_PEDIDO_TEXTO}
          style={{ width: '100%' }}
          placeholder={EXEMPLOS_PEDIDO[0]}
          disabled={trabalhando}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="botoes">
          <button type="button" className="primario" disabled={trabalhando || texto.trim().length < 3} onClick={() => void entender()}>
            Entender o pedido
          </button>
          {trabalhando && <button type="button" onClick={() => { pararRef.current = true; }}>Parar</button>}
        </div>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 12 }}>Exemplos de pedido</summary>
          {EXEMPLOS_PEDIDO.map((e) => (
            <div key={e}>
              <button type="button" className="pequeno" style={{ textAlign: 'left', whiteSpace: 'normal', marginBottom: 4 }} onClick={() => setTexto(e)}>{e}</button>
            </div>
          ))}
        </details>
        {ocupado && <p className="info">{ocupado}</p>}
        {aviso && <p className="aviso" role="alert">{aviso}</p>}
        {info && <p className="info">{info}</p>}
        {bloqueadoPor && <p className="ajuda">Aguardando: {bloqueadoPor}.</p>}
      </div>

      {estado.salvos.length > 0 && (
        <details className="cartao">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Pedidos salvos ({estado.salvos.length})</summary>
          <p className="ajuda">Os pedidos que você já rodou ficam aqui para repetir.</p>
          <ul className="lista">
            {estado.salvos.map((p) => (
              <li key={p.id}>
                <div>{p.texto}</div>
                <small>usado {p.vezes}x{p.usadoEm ? ` · última vez ${dataCurta(p.usadoEm)}` : ''}</small>
                <div className="botoes">
                  <button type="button" className="pequeno" disabled={trabalhando} onClick={() => { setTexto(p.texto); void entender(p.texto); }}>Repetir</button>
                  <button type="button" className="pequeno perigo" onClick={acao(async () => void (await motor.removerSalvo(p.id)))}>Apagar</button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {plano && (
        <div className="cartao" aria-label="Plano entendido">
          <h3>O que a IA entendeu (confira e edite)</h3>
          <p className="balao">{descreverPlano(doEditavel(plano))}</p>
          {perguntas.length > 0 && (
            <div className="aviso" role="alert">
              A IA ficou em dúvida e prefere perguntar a adivinhar:
              <ul>{perguntas.map((q) => <li key={q}>{q}</li>)}</ul>
              Responda editando o plano abaixo.
            </div>
          )}
          <label>
            Assunto a procurar
            <input aria-label="Assunto" value={plano.assunto} maxLength={200} onChange={(e) => setPlano({ ...plano, assunto: e.target.value })} placeholder="ex.: perguntei sobre estoque" />
          </label>
          <label>
            Período (dias para trás, de {PERIODO_MIN} a {PERIODO_MAX})
            <input aria-label="Período em dias" type="number" min={PERIODO_MIN} max={PERIODO_MAX} value={plano.periodo} onChange={(e) => setPlano({ ...plano, periodo: e.target.value })} />
          </label>
          <label>
            Quem falou por último
            <select aria-label="Quem falou por último" value={plano.quem} onChange={(e) => setPlano({ ...plano, quem: e.target.value as QuemFalou, ...(e.target.value !== 'eu' && plano.respondeu === 'nao' ? { respondeu: 'tanto_faz' as const } : {}) })}>
              <option value="eu">Eu falei por último</option>
              <option value="cliente">O cliente falou por último</option>
              <option value="tanto_faz">Tanto faz</option>
            </select>
          </label>
          <label>
            O cliente respondeu?
            <select aria-label="O cliente respondeu" value={plano.respondeu} onChange={(e) => setPlano({ ...plano, respondeu: e.target.value as PlanoEditavel['respondeu'], ...(e.target.value === 'nao' ? { quem: 'eu' as const } : {}) })}>
              <option value="nao">Não respondeu</option>
              <option value="sim">Respondeu</option>
              <option value="tanto_faz">Tanto faz</option>
            </select>
          </label>
          <label>
            Termos que o nome do contato deve ter (separe por vírgula; vazio = qualquer)
            <input aria-label="Termos do nome" value={plano.termos} onChange={(e) => setPlano({ ...plano, termos: e.target.value })} placeholder="ex.: padaria, central" />
          </label>
          <p className="ajuda">{AVISO_HISTORICO} A lista vem da última varredura (aba 1): {dados.contatos.length === 0 ? 'faça a varredura primeiro.' : `${dados.contatos.length} contatos salvos.`} Grupos, "Não enviar mais" e nomes repetidos nunca entram.</p>
          <div className="botoes">
            <button type="button" className="primario" disabled={trabalhando || bloqueadoPor != null || dados.contatos.length === 0} onClick={() => void buscar()} title="Só lê as conversas e confere com a IA. Não envia nada.">
              Buscar nas conversas (não envia)
            </button>
          </div>
        </div>
      )}

      {ultimo && (
        <div className="cartao" aria-label="Resultado do pedido">
          <h3>Resultado: {ultimo.plano.assunto}</h3>
          <p className="ajuda">{descreverPlano(ultimo.plano)}</p>
          <p className="ajuda">Rodada de {dataCurta(ultimo.rodadaEm)}: {resumoDaRodada(ultimo)}</p>
          {ultimo.avisos.map((a) => <p key={a} className="aviso">{a}</p>)}
          {ultimo.fora.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12 }}>Por que ficaram de fora</summary>
              <ul className="lista">{ultimo.fora.map(([m, n]) => <li key={m}>{n} · {m}</li>)}</ul>
            </details>
          )}
          {ultimo.itens.length === 0 ? (
            <p className="ajuda">Nenhuma conversa correspondeu a este pedido.</p>
          ) : (
            <>
              <p className="ajuda">
                Confiança baixa e conversas "revisar" vêm <b>desmarcadas</b>. Marque quem você quer e use as ações em lote, ou aja em cada um. Nada é enviado sem a prévia.
              </p>
              <div className="botoes">
                <button type="button" className="pequeno" onClick={acao(() => motor.marcarTodos(abertos.map((i) => i.chave), true))}>Marcar todos</button>
                <button type="button" className="pequeno" onClick={acao(() => motor.marcarTodos(abertos.map((i) => i.chave), false))}>Desmarcar todos</button>
              </div>
              <div className="botoes">
                <button type="button" className="primario pequeno" disabled={marcados.length === 0} onClick={() => abrirEnvio(marcados.map((i) => i.chave))}>
                  Enviar mensagem aos marcados ({marcados.length})
                </button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  em
                  <input aria-label="Dias do agendamento" type="number" min={DIAS_AGENDAR_MIN} max={DIAS_AGENDAR_MAX} value={diasAgendar} style={{ width: 56 }} onChange={(e) => setDiasAgendar(e.target.value)} />
                  dias
                </label>
                <button type="button" className="pequeno" disabled={marcados.length === 0} onClick={() => void agendar(marcados.map((i) => i.chave))}>Agendar marcados no CRM</button>
                <button type="button" className="pequeno perigo" disabled={marcados.length === 0} onClick={() => void naoEnviar(marcados.map((i) => i.chave))}>Não enviar mais (marcados)</button>
                <button type="button" className="pequeno" disabled={marcados.length === 0} onClick={acao(() => motor.ignorar(marcados.map((i) => i.chave)))}>Ignorar marcados</button>
              </div>
              <ul className="lista">{ultimo.itens.map(itemLinha)}</ul>
            </>
          )}
        </div>
      )}

      {paraEnviar && (
        <div className="cartao" aria-label="Enviar mensagem">
          <h3>Enviar mensagem a {paraEnviar.length} contato(s): prévia obrigatória</h3>
          <p className="ajuda">
            A mensagem é SUA: escreva os textos (sem link e sem preço; {'{nome}'} é opcional) ou deixe a IA escrever no seu estilo. Nada é enviado agora: depois da prévia aprovada, a campanha vai para a aba "3. Envio", onde o mesmo Executor das outras campanhas aplica a política
            (teto diário, horário, intervalo de 60 a 120 s, freio, "Não enviar mais", conferência da conversa e trava de agendamento do CRM, inclusive o intervalo mínimo de 14 dias entre campanhas).
          </p>
          <label className="check" style={{ display: 'flex', gap: 6 }}>
            <input type="radio" name="modo-pedido" checked={modo === 'meus_textos'} onChange={() => { setModo('meus_textos'); setPrevia(null); }} />
            <span>Usar os meus textos (sorteio entre as variações)</span>
          </label>
          <label className="check" style={{ display: 'flex', gap: 6 }}>
            <input type="radio" name="modo-pedido" checked={modo === 'ia_estilo'} onChange={() => { setModo('ia_estilo'); setPrevia(null); }} />
            <span>IA no meu estilo (os textos abaixo são os exemplos; se a IA falhar, sai um texto seu)</span>
          </label>
          {modo === 'ia_estilo' && (
            <label>
              Como você quer que soe (opcional, até {MAX_ESTILO} caracteres)
              <textarea aria-label="Estilo da mensagem" value={estilo} rows={2} maxLength={MAX_ESTILO} style={{ width: '100%' }} onChange={(e) => { setEstilo(e.target.value); setPrevia(null); }} />
            </label>
          )}
          <EditorDeTextos titulo="Seus textos para este pedido" ajuda={`Use ${'{nome}'} se quiser o primeiro nome do cliente (opcional).`} lista={textos} erros={errosTextos.textos1} sugestoes={SUGESTOES_ENVIO} idBase="pedido-texto" onChange={(l) => { setTextos(l); setPrevia(null); }} />
          <div className="botoes">
            <button type="button" className="primario" disabled={trabalhando || !errosTextos.ok || textos.every((t) => t.trim() === '')} onClick={() => void montarPrevia()}>Montar a prévia</button>
            <button type="button" onClick={() => { setParaEnviar(null); setPrevia(null); }}>Cancelar</button>
          </div>
          {previa?.erro && <p className="aviso" role="alert">{previa.erro}</p>}
          {previa && previa.itens.length > 0 && (
            <>
              <h4>Prévia: {previa.itens.length} mensagem(ns)</h4>
              <ul className="lista">
                {previa.itens.map((i) => (
                  <li key={i.chave}>
                    <b>{i.nome}</b> <small>texto: {rotuloOrigem(i.origem)}</small>
                    <div className="balao">{i.texto}</div>
                  </li>
                ))}
              </ul>
              <div className="botoes">
                <button type="button" className="primario" disabled={trabalhando} onClick={() => void aprovar()}>Aprovar e ir para o Envio (3)</button>
              </div>
            </>
          )}
          {previa && previa.excluidos.length > 0 && (
            <>
              <h4>Ficam de fora ({previa.excluidos.length})</h4>
              <ul className="lista">{previa.excluidos.map((x) => <li key={x.chave}><b>{x.nome}</b>: {x.motivo}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
