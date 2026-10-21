import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AJUSTES_PADRAO,
  type Ajustes as TipoAjustes,
  aplicarPerfil,
  avaliarRisco,
  definir,
  detectarPerfil,
  ehPadrao,
  EXPLICACAO_RISCO,
  type GrupoAjustes,
  type IdPerfil,
  LIMITES,
  MODELOS_PADRAO,
  NOMES_DIA,
  obter,
  PERFIS,
  restaurarCampo,
  restaurarGrupo,
  restaurarTudo,
  type Risco,
  validarAjustes,
} from '../shared/ajustes';
import { type Banco, salvarAjustes } from '../shared/banco';
import { MARCADOR_PRIMEIRO_NOME, MARCADOR_SAUDACAO, MAX_VARIACOES } from '../shared/constantes';

interface Props {
  db: Banco;
  ajustes: TipoAjustes;
  aoMudar: () => Promise<void>;
}

type Muda = (novo: TipoAjustes) => void;

function numeroDe(v: unknown): number | string {
  return typeof v === 'number' && Number.isFinite(v) ? v : '';
}

function textoPadrao(valor: unknown, unidade: string): string {
  if (typeof valor === 'boolean') return valor ? 'ligado' : 'desligado';
  return `${String(valor)}${unidade ? ` ${unidade}` : ''}`;
}

interface CampoProps {
  r: TipoAjustes;
  muda: Muda;
  erros: Map<string, string>;
  caminho: string;
  rotulo: string;
  unidade?: string;
  ajuda: string;
  /** Texto do limite absoluto mostrado ao lado ("máx. permitido 60"). */
  permitido?: string;
}

function Restaurar({ r, muda, caminho }: Pick<CampoProps, 'r' | 'muda' | 'caminho'>) {
  return (
    <button type="button" className="pequeno" disabled={ehPadrao(r, caminho)} onClick={() => muda(restaurarCampo(r, caminho))}>
      Restaurar padrão
    </button>
  );
}

function CampoNumero({ r, muda, erros, caminho, rotulo, unidade = '', ajuda, permitido }: CampoProps) {
  const erro = erros.get(caminho);
  return (
    <div className={`campo${erro ? ' com-erro' : ''}`}>
      <label>
        {rotulo}
        {unidade && <small> ({unidade})</small>}
        <input
          type="number"
          value={numeroDe(obter(r, caminho))}
          aria-invalid={erro ? true : undefined}
          onChange={(e) => muda(definir(r, caminho, e.target.value === '' ? Number.NaN : Number(e.target.value)))}
        />
      </label>
      <p className="ajuda">{ajuda}</p>
      <p className="padrao">
        Padrão: <b>{textoPadrao(obter(AJUSTES_PADRAO, caminho), unidade)}</b>
        {permitido && <> · {permitido}</>} <Restaurar r={r} muda={muda} caminho={caminho} />
      </p>
      {erro && <p className="erro" role="alert">{erro}</p>}
    </div>
  );
}

function CampoLigado({ r, muda, caminho, rotulo, ajuda }: Pick<CampoProps, 'r' | 'muda' | 'caminho' | 'rotulo' | 'ajuda'>) {
  return (
    <div className="campo">
      <label className="check">
        <input type="checkbox" checked={obter(r, caminho) === true} onChange={(e) => muda(definir(r, caminho, e.target.checked))} />
        {rotulo}
      </label>
      <p className="ajuda">{ajuda}</p>
      <p className="padrao">
        Padrão: <b>{textoPadrao(obter(AJUSTES_PADRAO, caminho), '')}</b> <Restaurar r={r} muda={muda} caminho={caminho} />
      </p>
    </div>
  );
}

function CampoTexto({ r, muda, erros, caminho, rotulo, ajuda, placeholder }: Pick<CampoProps, 'r' | 'muda' | 'erros' | 'caminho' | 'rotulo' | 'ajuda'> & { placeholder?: string }) {
  const erro = erros.get(caminho);
  return (
    <div className="campo">
      <label>
        {rotulo}
        <input type="text" value={String(obter(r, caminho) ?? '')} placeholder={placeholder} onChange={(e) => muda(definir(r, caminho, e.target.value))} />
      </label>
      <p className="ajuda">{ajuda}</p>
      <p className="padrao">
        Padrão: <b>{String(obter(AJUSTES_PADRAO, caminho)) || '(vazio)'}</b> <Restaurar r={r} muda={muda} caminho={caminho} />
      </p>
      {erro && <p className="erro" role="alert">{erro}</p>}
    </div>
  );
}

function Grupo({ titulo, grupo, r, muda, children, nota }: { titulo: string; grupo: GrupoAjustes; r: TipoAjustes; muda: Muda; children: ReactNode; nota?: string }) {
  return (
    <div className="cartao">
      <div className="lista-topo">
        <h3>{titulo}</h3>
        <button type="button" className="pequeno" disabled={ehPadrao(r, grupo)} onClick={() => muda(restaurarGrupo(r, grupo))}>
          Restaurar grupo
        </button>
      </div>
      {nota && <p className="ajuda">{nota}</p>}
      {children}
    </div>
  );
}

/** Troca a variação `j` e tira as vazias do fim (a lista guarda só o que foi escrito). */
function editarVariacao(atuais: string[], j: number, valor: string): string[] {
  const novas = Array.from({ length: MAX_VARIACOES }, (_, k) => (k === j ? valor : (atuais[k] ?? '')));
  while (novas.length > 0 && novas[novas.length - 1] === '') novas.pop();
  return novas;
}

const ROTULO_RISCO: Record<Risco['nivel'], string> = { baixo: 'risco BAIXO', medio: 'risco MÉDIO', alto: 'risco ALTO' };

function IndicadorRisco({ titulo, risco }: { titulo: string; risco: Risco }) {
  return (
    <details className={`risco-nivel risco-${risco.nivel}`}>
      <summary>
        {titulo}: <b>{ROTULO_RISCO[risco.nivel]}</b> ({risco.pontos} pontos)
      </summary>
      <ul className="lista-simples">
        {risco.motivos.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </details>
  );
}

export function Ajustes({ db, ajustes, aoMudar }: Props) {
  const [rascunho, setRascunho] = useState<TipoAjustes>(ajustes);
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const alterado = useMemo(() => JSON.stringify(rascunho) !== JSON.stringify(ajustes), [rascunho, ajustes]);
  const errosLista = useMemo(() => validarAjustes(rascunho), [rascunho]);
  const erros = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of errosLista) if (!m.has(e.campo)) m.set(e.campo, e.mensagem);
    return m;
  }, [errosLista]);
  const perfil = detectarPerfil(rascunho);

  // O que está salvo mudou por fora (importação, restauração): acompanha, a menos que haja edição em curso.
  useEffect(() => {
    setRascunho(ajustes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ajustes)]);

  function muda(novo: TipoAjustes) {
    setMsg(null);
    setRascunho(novo);
  }

  async function salvar() {
    if (errosLista.length > 0) return;
    setSalvando(true);
    try {
      const r = await salvarAjustes(db, rascunho);
      if (!r.ok) {
        setMsg(`Não salvei: ${r.erros[0]?.mensagem ?? 'valores inválidos'}`);
        return;
      }
      setRascunho(r.ajustes);
      await aoMudar();
      setMsg('Ajustes salvos. Valem a partir do próximo contato.');
    } finally {
      setSalvando(false);
    }
  }

  function aplicar(id: IdPerfil) {
    muda(aplicarPerfil(rascunho, id));
  }

  const r = rascunho;
  const rampaLigada = r.limites.rampa.ligada;

  return (
    <section className="ajustes">
      <p className="ajuda">
        Aqui você monta o ritmo e os limites do seu jeito. Tudo já vem preenchido com os valores de sempre; edite à vontade e clique em <b>Salvar</b>. Os
        limites absolutos de segurança não podem ser ultrapassados. Isto <b>não liga o modo automático</b> (isso só na aba Dados) e não muda nenhuma
        trava de envio.
      </p>

      <div className="cartao">
        <h3>Perfis</h3>
        <p className="ajuda">Um clique preenche ritmo e tetos; depois ajuste campo a campo. Horários, freio, filtros e textos não mudam.</p>
        <div className="perfis">
          {PERFIS.map((p) => (
            <button key={p.id} type="button" className={perfil === p.id ? 'primario' : ''} onClick={() => aplicar(p.id)} title={p.descricao}>
              {p.nome}
            </button>
          ))}
        </div>
        <p className="info">
          Perfil atual: <b>{perfil === 'personalizado' ? 'Personalizado' : PERFIS.find((p) => p.id === perfil)?.nome}</b>
        </p>
        <ul className="lista-simples">
          {PERFIS.map((p) => (
            <li key={p.id}>
              <b>{p.nome}:</b> {p.descricao}
            </li>
          ))}
        </ul>
        <IndicadorRisco titulo="Modo manual" risco={avaliarRisco(r, 'manual')} />
        <IndicadorRisco titulo="Modo automático" risco={avaliarRisco(r, 'auto')} />
        <p className="ajuda">{EXPLICACAO_RISCO}</p>
      </div>

      <Grupo titulo="1. Ritmo" grupo="ritmo" r={r} muda={muda}>
        <div className="linha2">
          <CampoNumero r={r} muda={muda} erros={erros} caminho="ritmo.manual.minSeg" rotulo="Manual: intervalo mínimo" unidade="s" ajuda="Espera mínima entre um envio e a abertura do próximo contato (você aperta o Enter)." permitido={`mín. permitido ${LIMITES.intervaloMinSeg} s`} />
          <CampoNumero r={r} muda={muda} erros={erros} caminho="ritmo.manual.maxSeg" rotulo="Manual: intervalo máximo" unidade="s" ajuda="O intervalo de cada contato é sorteado entre o mínimo e o máximo." permitido={`máx. ${LIMITES.intervaloMaxSeg} s`} />
        </div>
        <div className="linha2">
          <CampoNumero r={r} muda={muda} erros={erros} caminho="ritmo.auto.minSeg" rotulo="Automático: intervalo mínimo" unidade="s" ajuda="Espera mínima entre envios no modo automático." permitido={`mín. permitido ${LIMITES.intervaloMinSeg} s`} />
          <CampoNumero r={r} muda={muda} erros={erros} caminho="ritmo.auto.maxSeg" rotulo="Automático: intervalo máximo" unidade="s" ajuda="Sorteio entre mínimo e máximo, como no manual." permitido={`máx. ${LIMITES.intervaloMaxSeg} s`} />
        </div>
        <CampoLigado r={r} muda={muda} caminho="ritmo.pausaLonga.ligada" rotulo="Pausa longa no automático" ajuda="Um descanso maior de vez em quando, para o ritmo parecer humano." />
        <div className="linha2">
          <CampoNumero r={r} muda={muda} erros={erros} caminho="ritmo.pausaLonga.aCadaEnvios" rotulo="Pausa longa a cada" unidade="envios" ajuda="Quantos envios seguidos antes da pausa longa." permitido={`${LIMITES.pausaACadaMin} a ${LIMITES.pausaACadaMax}`} />
          <CampoNumero r={r} muda={muda} erros={erros} caminho="ritmo.pausaLonga.minMin" rotulo="Pausa longa: mínimo" unidade="min" ajuda="Duração mínima da pausa." permitido={`${LIMITES.pausaMinutosMin} a ${LIMITES.pausaMinutosMax} min`} />
          <CampoNumero r={r} muda={muda} erros={erros} caminho="ritmo.pausaLonga.maxMin" rotulo="Pausa longa: máximo" unidade="min" ajuda="Duração máxima da pausa (sorteada)." permitido={`${LIMITES.pausaMinutosMin} a ${LIMITES.pausaMinutosMax} min`} />
        </div>
        <CampoNumero r={r} muda={muda} erros={erros} caminho="ritmo.contagemSeg" rotulo="Contagem antes do envio automático" unidade="s" ajuda="Tempo visível, com botão Cancelar, antes de cada envio automático." permitido={`mín. permitido ${LIMITES.contagemMinSeg} s`} />
      </Grupo>

      <Grupo titulo="2. Limites por dia" grupo="limites" r={r} muda={muda}>
        <div className="linha2">
          <CampoNumero r={r} muda={muda} erros={erros} caminho="limites.tetoManual" rotulo="Teto diário no manual" unidade="mensagens" ajuda="Quantas mensagens de campanha por dia, somando todas as campanhas." permitido={`MÁXIMO PERMITIDO ${LIMITES.tetoManual}`} />
          <CampoNumero r={r} muda={muda} erros={erros} caminho="limites.tetoAuto" rotulo="Teto diário no automático" unidade="mensagens" ajuda="Idem, quando o modo automático está ligado." permitido={`MÁXIMO PERMITIDO ${LIMITES.tetoAuto}`} />
        </div>
        <CampoLigado r={r} muda={muda} caminho="limites.rampa.ligada" rotulo="Rampa de volume (começar devagar)" ajuda="Opcional: nos primeiros dias de uso o teto é menor. Vale o menor entre o teto do modo e o da rampa. O dia 1 é o dia do primeiro envio registrado." />
        {rampaLigada && (
          <div className="linha2">
            <CampoNumero r={r} muda={muda} erros={erros} caminho="limites.rampa.dia1a7" rotulo="Dias 1 a 7" unidade="mensagens" ajuda="Teto por dia na primeira semana." permitido={`máx. ${LIMITES.tetoManual}`} />
            <CampoNumero r={r} muda={muda} erros={erros} caminho="limites.rampa.dia8a14" rotulo="Dias 8 a 14" unidade="mensagens" ajuda="Teto por dia na segunda semana." permitido={`máx. ${LIMITES.tetoManual}`} />
            <CampoNumero r={r} muda={muda} erros={erros} caminho="limites.rampa.depois" rotulo="Depois do dia 14" unidade="mensagens" ajuda="Teto por dia daí em diante." permitido={`máx. ${LIMITES.tetoManual}`} />
          </div>
        )}
      </Grupo>

      <Grupo titulo="3. Horários" grupo="horarios" r={r} muda={muda} nota={`Fuso fixo: America/Fortaleza (não editável). Janelas entre ${LIMITES.horaMin}h e ${LIMITES.horaMax}h. O fim é exclusivo: 18 significa até 17:59.`}>
        <ul className="lista-simples horarios">
          {r.horarios.map((j, i) => (
            <li key={j.dia} className={erros.has(`horarios.${i}.inicio`) || erros.has(`horarios.${i}.fim`) ? 'com-erro' : ''}>
              <label className="check">
                <input type="checkbox" checked={j.ligado} onChange={(e) => muda(definir(r, `horarios.${i}.ligado`, e.target.checked))} />
                {NOMES_DIA[j.dia]}
              </label>
              <label className="inline">
                início (h)
                <input type="number" value={numeroDe(j.inicio)} disabled={!j.ligado} onChange={(e) => muda(definir(r, `horarios.${i}.inicio`, e.target.value === '' ? Number.NaN : Number(e.target.value)))} />
              </label>
              <label className="inline">
                fim (h)
                <input type="number" value={numeroDe(j.fim)} disabled={!j.ligado} onChange={(e) => muda(definir(r, `horarios.${i}.fim`, e.target.value === '' ? Number.NaN : Number(e.target.value)))} />
              </label>
              <button type="button" className="pequeno" disabled={ehPadrao(r, `horarios.${i}`)} onClick={() => muda(restaurarCampo(r, `horarios.${i}`))}>
                Restaurar padrão
              </button>
              <small className="padrao">
                padrão: {AJUSTES_PADRAO.horarios[i].ligado ? `${AJUSTES_PADRAO.horarios[i].inicio}h às ${AJUSTES_PADRAO.horarios[i].fim}h` : 'sem campanha'}
              </small>
              {(erros.get(`horarios.${i}.inicio`) ?? erros.get(`horarios.${i}.fim`)) && (
                <p className="erro" role="alert">{erros.get(`horarios.${i}.inicio`) ?? erros.get(`horarios.${i}.fim`)}</p>
              )}
            </li>
          ))}
        </ul>
      </Grupo>

      <Grupo titulo="4. Freio" grupo="freio" r={r} muda={muda}>
        <div className="linha2">
          <CampoNumero r={r} muda={muda} erros={erros} caminho="freio.problemasManual" rotulo="Problemas seguidos para pausar (manual)" unidade="problemas" ajuda="Depois de tantos problemas seguidos a campanha pausa. Conferências que falham antes de colar não contam." permitido={`${LIMITES.problemasMin} a ${LIMITES.problemasMax}`} />
          <CampoNumero r={r} muda={muda} erros={erros} caminho="freio.problemasAuto" rotulo="Problemas seguidos para pausar (automático)" unidade="problemas" ajuda="Idem, no modo automático (mais rígido por padrão)." permitido={`${LIMITES.problemasMin} a ${LIMITES.problemasMax}`} />
        </div>
        <CampoLigado r={r} muda={muda} caminho="freio.pausarEmAviso" rotulo="Pausar quando o WhatsApp mostrar um aviso (recomendado)" ajuda="Desligado, um aviso que aparece enquanto o painel espera só é mostrado, sem pausar. Antes de abrir uma conversa e antes de enviar, aviso na tela continua bloqueando (fixo)." />
        <CampoNumero r={r} muda={muda} erros={erros} caminho="freio.esperaDigitandoSeg" rotulo="Espera quando você está digitando" unidade="s" ajuda="No automático, se você está digitando no WhatsApp, o painel não mexe em nada e tenta de novo depois deste tempo." permitido={`${LIMITES.digitandoMinSeg} a ${LIMITES.digitandoMaxSeg} s`} />
      </Grupo>

      <Grupo titulo="5. Filtros padrão" grupo="filtros" r={r} muda={muda} nota="Valores iniciais da aba Varredura e da aba Prévia.">
        <CampoTexto r={r} muda={muda} erros={erros} caminho="filtros.termo" rotulo="Termo de busca / nome contém" ajuda="Na Varredura é o termo buscado no WhatsApp; na Prévia, o filtro 'nome contém' (separe por vírgula). Vazio = lista inteira." placeholder="ex.: CLIENTE" />
        <CampoTexto r={r} muda={muda} erros={erros} caminho="filtros.naoContem" rotulo="Nome NÃO contém" ajuda="Contatos com estes termos ficam de fora (separe por vírgula)." placeholder="ex.: FORNECEDOR" />
        <CampoNumero r={r} muda={muda} erros={erros} caminho="filtros.excluirContatadosHaDias" rotulo="Excluir recém-contatados" unidade="dias" ajuda="Quem recebeu campanha há menos que isto fica de fora." permitido={`mín. permitido ${LIMITES.diasSemRepetirMin} dias`} />
      </Grupo>

      <Grupo titulo="6. Texto" grupo="texto" r={r} muda={muda}>
        <CampoNumero r={r} muda={muda} erros={erros} caminho="texto.tamanhoMax" rotulo="Tamanho máximo da mensagem" unidade="caracteres" ajuda="Mensagens maiores são recusadas." permitido={`máx. permitido ${LIMITES.tamanhoTextoMax}`} />
        <p className="ajuda">
          <b>Regras fixas (não editáveis):</b> sem link na primeira mensagem (bloqueio obrigatório) · sem quebra de linha (texto em uma linha só) · só os marcadores{' '}
          {MARCADOR_PRIMEIRO_NOME} e {MARCADOR_SAUDACAO}. {MARCADOR_SAUDACAO} vira Bom dia (até 11:59), Boa tarde (até 17:59) ou Boa noite, no horário de Fortaleza.
        </p>
        <h4>Modelos de mensagem salvos</h4>
        <p className="ajuda">Na aba Prévia você escolhe um modelo para preencher o texto base e as variações (até {MAX_VARIACOES}).</p>
        {r.texto.modelos.map((m, i) => (
          <div key={m.id} className="modelo">
            <div className="lista-topo">
              <label className="inline">
                <input type="radio" name="modeloPadrao" checked={r.texto.modeloPadraoId === m.id} onChange={() => muda(definir(r, 'texto.modeloPadraoId', m.id))} />
                padrão na Prévia
              </label>
              <button type="button" className="pequeno" onClick={() => muda(definir(r, 'texto', { ...r.texto, modeloPadraoId: r.texto.modeloPadraoId === m.id ? null : r.texto.modeloPadraoId, modelos: r.texto.modelos.filter((x) => x.id !== m.id) }))}>
                Remover
              </button>
            </div>
            <label>
              Nome do modelo
              <input type="text" value={m.nome} onChange={(e) => muda(definir(r, `texto.modelos.${i}.nome`, e.target.value))} />
            </label>
            {erros.get(`texto.modelos.${i}.nome`) && <p className="erro" role="alert">{erros.get(`texto.modelos.${i}.nome`)}</p>}
            <label>
              Texto base
              <textarea rows={3} value={m.texto} onChange={(e) => muda(definir(r, `texto.modelos.${i}.texto`, e.target.value))} />
            </label>
            {erros.get(`texto.modelos.${i}.texto`) && <p className="erro" role="alert">{erros.get(`texto.modelos.${i}.texto`)}</p>}
            {Array.from({ length: MAX_VARIACOES }, (_, j) => (
              <label key={j}>
                Variação {j + 1} (opcional)
                <textarea rows={2} value={m.variacoes[j] ?? ''} onChange={(e) => muda(definir(r, `texto.modelos.${i}.variacoes`, editarVariacao(m.variacoes, j, e.target.value)))} />
                {erros.get(`texto.modelos.${i}.variacoes.${j}`) && <span className="erro" role="alert">{erros.get(`texto.modelos.${i}.variacoes.${j}`)}</span>}
              </label>
            ))}
          </div>
        ))}
        <div className="linha2">
          <button
            type="button"
            disabled={r.texto.modelos.length >= LIMITES.maxModelos}
            onClick={() => muda(definir(r, 'texto.modelos', [...r.texto.modelos, { id: `m-${Date.now().toString(36)}`, nome: `Modelo ${r.texto.modelos.length + 1}`, texto: `Olá, ${MARCADOR_PRIMEIRO_NOME}, tudo bem?`, variacoes: [] }]))}
          >
            Adicionar modelo
          </button>
          <button type="button" disabled={ehPadrao(r, 'texto.modelos')} onClick={() => muda(definir(r, 'texto.modelos', structuredClone(MODELOS_PADRAO)))}>
            Restaurar modelos padrão
          </button>
        </div>
      </Grupo>

      <div className="cartao">
        <h3>Limites absolutos (fixos)</h3>
        <ul className="lista-simples">
          <li>Intervalo entre contatos: nunca abaixo de {LIMITES.intervaloMinSeg} s.</li>
          <li>Teto diário: no máximo {LIMITES.tetoManual} no manual e {LIMITES.tetoAuto} no automático.</li>
          <li>Contagem antes do envio automático: nunca abaixo de {LIMITES.contagemMinSeg} s.</li>
          <li>Horários: só entre {LIMITES.horaMin}h e {LIMITES.horaMax}h, fuso America/Fortaleza.</li>
          <li>Recém-contatados: nunca menos de {LIMITES.diasSemRepetirMin} dias. Uma mensagem por contato por campanha.</li>
          <li>Sempre obrigatórios: token por envio, conferências do contato e do texto, envio só no automático autorizado, nenhum Enter simulado, bloqueio de link e de quebra de linha.</li>
        </ul>
      </div>

      <div className="cartao">
        <button type="button" className="perigo" onClick={() => { if (window.confirm('Restaurar TODOS os ajustes para os padrões? (Você ainda precisa clicar em Salvar.)')) muda(restaurarTudo()); }}>
          Restaurar tudo
        </button>
      </div>

      <div className={`barra-salvar${alterado ? ' pendente' : ''}`} role="status">
        <span>{errosLista.length > 0 ? `${errosLista.length} problema(s) a corrigir` : alterado ? 'Alterações não salvas' : 'Tudo salvo'}</span>
        <button type="button" onClick={() => muda(ajustes)} disabled={!alterado}>
          Descartar
        </button>
        <button type="button" className="primario" onClick={() => void salvar()} disabled={!alterado || errosLista.length > 0 || salvando}>
          Salvar
        </button>
      </div>
      {errosLista.length > 0 && (
        <ul className="erro" role="alert">
          {errosLista.slice(0, 8).map((e) => (
            <li key={`${e.campo}-${e.mensagem}`}>{e.mensagem}</li>
          ))}
        </ul>
      )}
      {msg && <p className="info">{msg}</p>}
    </section>
  );
}
