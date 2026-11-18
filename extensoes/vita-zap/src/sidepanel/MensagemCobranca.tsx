// "Sua mensagem de cobrança" (v0.7.55): o dono escolhe o estilo da cobrança automática.
// Modo 1 (padrão) "Usar os meus textos": variações da 1ª e da 2ª cobrança, sorteadas por contato. Sem IA.
// Modo 2 "IA escreve no meu estilo": instruções + os textos do dono como exemplos; se a IA falhar, sai um texto do dono.
// Não há modelo genérico para envio: sem pelo menos 1 texto da 1ª cobrança, a cobrança automática não liga.

import { useEffect, useMemo, useState } from 'react';
import type { ConfigFollowup } from '../shared/followup';
import {
  MARCADOR_NOME,
  MAX_COBRANCA,
  MAX_ESTILO,
  MAX_TEXTOS,
  NOME_EXEMPLO,
  SUGESTOES_1,
  SUGESTOES_2,
  errosDoRascunho,
  previaDosTextos,
  rascunhoDeConfig,
  rascunhoMudou,
  type ModoCobranca,
  type RascunhoMensagem,
} from '../shared/followup-estilo';

interface Props {
  config: ConfigFollowup;
  /** Salvar/refazer a fila não pode rodar junto com uma leitura ou envio em andamento. */
  ocupado: boolean;
  onSalvar: (r: RascunhoMensagem) => Promise<void>;
}

interface EditorProps {
  titulo: string;
  ajuda: string;
  lista: string[];
  erros: string[][];
  sugestoes: readonly string[];
  idBase: string;
  onChange: (l: string[]) => void;
}

export function EditorDeTextos({ titulo, ajuda, lista, erros, sugestoes, idBase, onChange }: EditorProps) {
  const cheio = lista.length >= MAX_TEXTOS;
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '10px 0 0' }}>
      <legend style={{ fontWeight: 600, fontSize: 13 }}>{titulo}</legend>
      <p className="ajuda">{ajuda}</p>
      {lista.map((t, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <textarea
            id={`${idBase}-${i}`}
            aria-label={`${titulo}, variação ${i + 1}`}
            value={t}
            rows={2}
            style={{ width: '100%' }}
            placeholder={`Ex.: Oi, ${MARCADOR_NOME}! Conseguiu ver a minha mensagem? Fico à disposição.`}
            onChange={(e) => onChange(lista.map((x, k) => (k === i ? e.target.value : x)))}
          />
          <div className="ajuda" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{t.trim() === '' ? '' : `${t.trim().replace(/\{\s*nome\s*\}/gi, NOME_EXEMPLO).length}/${MAX_COBRANCA} caracteres com o nome`}</span>
            <button type="button" className="pequeno perigo" aria-label={`Remover ${titulo}, variação ${i + 1}`} onClick={() => onChange(lista.filter((_, k) => k !== i))}>
              Remover
            </button>
          </div>
          {(erros[i] ?? []).map((e) => (
            <p key={e} className="aviso" style={{ margin: '2px 0' }}>
              {e}
            </p>
          ))}
        </div>
      ))}
      <div className="botoes">
        <button type="button" className="pequeno" disabled={cheio} onClick={() => onChange([...lista, ''])}>
          Adicionar variação {cheio ? `(máximo ${MAX_TEXTOS})` : `(${lista.filter((x) => x.trim() !== '').length}/${MAX_TEXTOS})`}
        </button>
        <details style={{ display: 'inline-block' }}>
          <summary style={{ cursor: 'pointer', fontSize: 12 }}>Ideias de ponto de partida</summary>
          <p className="ajuda">Clique para copiar para o editor e depois reescreva do seu jeito. Nada disto é enviado se você não salvar.</p>
          {sugestoes.map((s) => (
            <div key={s} style={{ marginBottom: 4 }}>
              <button
                type="button"
                className="pequeno"
                disabled={cheio}
                onClick={() => onChange([...lista.filter((x) => x.trim() !== ''), s])}
                style={{ textAlign: 'left', whiteSpace: 'normal' }}
              >
                {s}
              </button>
            </div>
          ))}
        </details>
      </div>
    </fieldset>
  );
}

export function MensagemCobranca({ config, ocupado, onSalvar }: Props) {
  const [r, setR] = useState<RascunhoMensagem>(() => rascunhoDeConfig(config));
  const [previa, setPrevia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvoAgora, setSalvoAgora] = useState(false);

  // O que está salvo mudou por fora (ex.: backup importado): o rascunho acompanha, a menos que o dono esteja editando.
  const assinaturaSalva = useMemo(() => JSON.stringify([config.modo, config.textos1, config.textos2, config.estilo]), [config.modo, config.textos1, config.textos2, config.estilo]);
  useEffect(() => {
    setR(rascunhoDeConfig(config));
  }, [assinaturaSalva]);

  const erros = errosDoRascunho(r);
  const mudou = rascunhoMudou(r, config);
  const semTexto1 = r.textos1.every((t) => t.trim() === '');

  const salvar = async () => {
    setSalvando(true);
    try {
      await onSalvar(r);
      setSalvoAgora(true);
    } finally {
      setSalvando(false);
    }
  };
  const editar = (m: Partial<RascunhoMensagem>) => {
    setSalvoAgora(false);
    setR((x) => ({ ...x, ...m }));
  };

  return (
    <div className="cartao" aria-label="Sua mensagem de cobrança">
      <h3>Sua mensagem de cobrança</h3>
      <p className="ajuda">
        Você define o estilo: a cobrança automática só usa o que você escrever aqui. Use <b>{MARCADOR_NOME}</b> se quiser o primeiro nome do cliente (opcional). Sem link, sem preço e sem alegação sobre o produto.
      </p>
      {config.desligadaSemTexto && !config.ligado && (
        <p className="aviso" role="alert">
          A cobrança automática foi desligada: ela estava ligada sem uma mensagem sua (os modelos genéricos não são mais enviados). Escreva a sua mensagem e ligue de novo.
        </p>
      )}
      <div role="radiogroup" aria-label="Modo da mensagem" style={{ display: 'grid', gap: 6, fontSize: 13 }}>
        {(
          [
            ['meus_textos', 'Usar os meus textos', 'O app sorteia uma das suas variações para cada contato (sem repetir a mesma em seguida). Sem IA.'],
            ['ia_estilo', 'IA escreve no meu estilo', 'A IA escreve cada mensagem imitando o seu jeito (instruções + os seus textos como exemplo). Se a IA falhar, sai um dos seus textos.'],
          ] as Array<[ModoCobranca, string, string]>
        ).map(([id, rotulo, desc]) => (
          <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="radio" name="modo-cobranca" value={id} checked={r.modo === id} onChange={() => editar({ modo: id })} style={{ width: "auto", flex: "none", margin: "3px 0 0" }} />
            <span style={{ flex: 1, textAlign: 'left' }}>
              <b>{rotulo}</b>
              {id === 'meus_textos' ? ' (padrão)' : ''}
              <br />
              <span className="ajuda">{desc}</span>
            </span>
          </label>
        ))}
      </div>

      {r.modo === 'ia_estilo' && (
        <label style={{ display: 'block', marginTop: 10, fontSize: 13, fontWeight: 600 }}>
          Como devo escrever
          <textarea
            value={r.estilo}
            rows={3}
            maxLength={MAX_ESTILO + 100}
            style={{ width: '100%', fontWeight: 400 }}
            placeholder="Ex.: curto e informal, trato por você, no máximo 1 emoji, sem exclamação."
            onChange={(e) => editar({ estilo: e.target.value })}
          />
          <span className="ajuda" style={{ fontWeight: 400 }}>
            {r.estilo.trim().length}/{MAX_ESTILO} caracteres. Os textos abaixo servem de exemplo: a IA imita o tom, o tamanho e as palavras, sem copiar.
          </span>
          {erros.estilo && <span className="aviso" style={{ display: 'block' }}>{erros.estilo}</span>}
        </label>
      )}

      <EditorDeTextos
        idBase="cobranca1"
        titulo="1ª cobrança"
        ajuda={r.modo === 'ia_estilo' ? 'Seus textos da 1ª cobrança (exemplos para a IA e reserva se ela falhar). Obrigatório: pelo menos 1.' : 'Escreva de 1 a 10 variações. Pelo menos 1 é obrigatória.'}
        lista={r.textos1}
        erros={erros.textos1}
        sugestoes={SUGESTOES_1}
        onChange={(l) => editar({ textos1: l })}
      />
      <EditorDeTextos
        idBase="cobranca2"
        titulo="2ª cobrança (última)"
        ajuda="Opcional. Sem textos aqui, a 2ª cobrança usa os da 1ª, sem repetir o que o contato já recebeu."
        lista={r.textos2}
        erros={erros.textos2}
        sugestoes={SUGESTOES_2}
        onChange={(l) => editar({ textos2: l })}
      />

      {semTexto1 && <p className="aviso">Sem pelo menos 1 texto para a 1ª cobrança, a cobrança automática não liga.</p>}

      <div className="botoes">
        <button type="button" className="primario" disabled={!erros.ok || !mudou || salvando || ocupado} onClick={() => void salvar()}>
          Salvar minha mensagem
        </button>
        <button type="button" onClick={() => setPrevia((p) => !p)} aria-expanded={previa}>
          Ver exemplo
        </button>
      </div>
      {ocupado && <p className="ajuda">Há uma leitura ou envio em andamento: espere terminar (ou use "Parar agora") para salvar.</p>}
      {mudou && !salvoAgora && <p className="ajuda">Há alterações não salvas. O que está salvo é o que a cobrança usa.</p>}
      {salvoAgora && !mudou && <p className="info">Mensagem salva. Quem já estava na fila teve o texto refeito com ela.</p>}

      {previa && (
        <div aria-label="Exemplo da mensagem">
          <p className="ajuda">Como fica para um cliente fictício chamado "{NOME_EXEMPLO}":</p>
          {([['1ª cobrança', r.textos1], ['2ª cobrança', r.textos2.length > 0 ? r.textos2 : r.textos1]] as const).map(([rotulo, lista]) => {
            const exemplos = previaDosTextos(lista);
            return (
              <div key={rotulo}>
                <b style={{ fontSize: 12 }}>{rotulo}</b>
                {exemplos.length === 0 ? (
                  <p className="ajuda">Escreva um texto para ver o exemplo.</p>
                ) : (
                  exemplos.map((e, i) => (
                    <div key={i} className="balao">
                      {e}
                    </div>
                  ))
                )}
              </div>
            );
          })}
          {r.modo === 'ia_estilo' && (
            <p className="ajuda">No modo "IA no meu estilo" a IA escreve textos novos parecidos com estes (não são idênticos). Se ela falhar, sai exatamente um destes.</p>
          )}
        </div>
      )}
    </div>
  );
}
