import { describe, expect, it } from 'vitest';
import type { ContatoVarrido } from '../src/shared/contatos';
import { aplicarFiltros, FILTROS_PADRAO, MOTIVO_SEM_MENSAGEM_MINHA, MOTIVO_SINAL_DESCONHECIDO, type ContextoFiltro, type Filtros } from '../src/shared/filtros';
import { chaveContato } from '../src/shared/nomes';
import { criarItens, validarParaAprovar } from '../src/shared/campanha';

const AGORA = new Date('2026-10-26T15:00:00Z');

function criarContato(nome: string, p: Partial<ContatoVarrido> = {}): ContatoVarrido {
  return {
    chave: chaveContato(nome),
    nome,
    rotuloData: '10/09/2026',
    ultimaConversa: '2026-09-10',
    revisarData: null,
    soNumero: false,
    pareceGrupo: false,
    temConversa: true,
    duplicado: false,
    varridoEm: AGORA.toISOString(),
    // varrido antes da 0.7.21: sem o campo ultimaDeMim (undefined)
    ultimaDeMim: undefined,
    ...p,
  };
}

const ctx: ContextoFiltro = {
  agora: AGORA,
  naoEnviar: new Set(),
  ultimoEnvioPorChave: new Map(),
};

describe('Cenário do Dono: varredura com termo CLIENTE, sem ultimaDeMim e data até 16/09', () => {
  it('reproduz a varredura com contatos legados e NÃO exibe a dica falsa de nome', () => {
    // 570 contatos na memória:
    // ~430 contêm CLIENTE (com datas antes de 16/09/2026, legados sem ultimaDeMim)
    const contatosClienteValidos: ContatoVarrido[] = Array.from({ length: 98 }, (_, i) =>
      criarContato(`João ${i + 1} CLIENTE`, {
        ultimaConversa: '2026-09-10',
        ultimaDeMim: undefined, // legado antes da 0.7.21
      }),
    );
    const contatosClienteDataRecente: ContatoVarrido[] = Array.from({ length: 231 }, (_, i) =>
      criarContato(`Maria ${i + 1} CLIENTE`, {
        ultimaConversa: '2026-10-01', // posterior a 16/09
        ultimaDeMim: undefined,
      }),
    );
    const contatosSemClienteNoNome: ContatoVarrido[] = Array.from({ length: 140 }, (_, i) =>
      criarContato(`Padaria Santo Antônio ${i + 1}`, {
        ultimaConversa: '2026-09-01',
        ultimaDeMim: undefined,
      }),
    );
    const contatosSoNumero: ContatoVarrido[] = Array.from({ length: 101 }, (_, i) =>
      criarContato(`+55 84 99999-${1000 + i}`, {
        soNumero: true,
        ultimaConversa: null,
        ultimaDeMim: undefined,
      }),
    );

    const todosContatos = [
      ...contatosClienteValidos,
      ...contatosClienteDataRecente,
      ...contatosSemClienteNoNome,
      ...contatosSoNumero,
    ];
    expect(todosContatos.length).toBe(570);

    // Filtros aplicados pelo dono:
    // "Nome contém: CLIENTE", "Última conversa até 16/09/2026" e "Só contatos com conversa já feita por mim"
    const filtros: Filtros = {
      ...FILTROS_PADRAO,
      contem: ['CLIENTE'],
      ultimaConversaAntesDe: '2026-09-16',
      soComMensagemMinha: true,
    };

    const avaliados = aplicarFiltros(todosContatos, filtros, ctx);

    const incluidos = avaliados.filter((a) => a.decisao.situacao === 'incluido');
    const revisar = avaliados.filter((a) => a.decisao.situacao === 'revisar');
    const excluidos = avaliados.filter((a) => a.decisao.situacao === 'excluido');

    // 1. Os 98 contatos válidos com CLIENTE e data até 16/09 NÃO são excluídos como "sem mensagem sua".
    // Eles entram em "revisar" com o motivo claro de sinal desconhecido.
    expect(revisar.length).toBe(98);
    expect(revisar.every((r) => r.decisao.motivo === MOTIVO_SINAL_DESCONHECIDO)).toBe(true);
    expect(revisar.every((r) => r.contato.nome.includes('CLIENTE'))).toBe(true);

    // Nenhum deles foi marcado com MOTIVO_SEM_MENSAGEM_MINHA
    expect(excluidos.some((e) => e.decisao.motivo === MOTIVO_SEM_MENSAGEM_MINHA)).toBe(false);

    // 2. Os excluídos foram por outros motivos legítimos (nome não contém CLIENTE, data posterior, só número):
    const motivosExclusao = new Map<string, number>();
    for (const e of excluidos) {
      motivosExclusao.set(e.decisao.motivo, (motivosExclusao.get(e.decisao.motivo) ?? 0) + 1);
    }
    expect(motivosExclusao.get('nome não contém "CLIENTE"')).toBe(140);
    expect(motivosExclusao.get('não salvo na agenda (aparece só o número)')).toBe(101);
    expect(motivosExclusao.get('última conversa 10/10/2026 é posterior a 16/09/2026') ?? motivosExclusao.get('última conversa 01/10/2026 é posterior a 16/09/2026')).toBe(231);

    // 3. REGRA CRUCIAL (b): A dica "Seus contatos não têm CLIENTE no nome" NÃO pode aparecer!
    // Porque NÃO foram todos os excluídos que caíram pelo nome.
    const todosExcluidosPorNome =
      excluidos.length > 0 &&
      excluidos.every((a) => a.decisao.motivo.startsWith('nome não contém') || a.decisao.motivo.startsWith('nome contém'));
    expect(todosExcluidosPorNome).toBe(false);

    // 4. REGRA CRUCIAL (c): O botão Gerar prévia DEVE liberar (incluidos > 0 || revisar > 0)
    const podeLiberarGerarPrevia = incluidos.length > 0 || revisar.length > 0;
    expect(podeLiberarGerarPrevia).toBe(true);

    // 5. Ao gerar a prévia com os de revisar, eles entram desmarcados para o usuário marcar
    const modelos = ['Olá {primeiroNome}, tudo bem?'];
    const itensInc = criarItens(incluidos.map((a) => a.contato), modelos, filtros.contem).map((i) => ({ ...i, marcado: true }));
    const itensRev = criarItens(revisar.map((a) => a.contato), modelos, filtros.contem).map((i) => ({ ...i, marcado: false }));
    const todosItens = [...itensInc, ...itensRev];

    expect(todosItens.length).toBe(98);
    expect(todosItens.every((i) => i.marcado === false)).toBe(true);

    // Se o usuário marcar todos (ou marcar individualmente), pode aprovar
    const marcados = todosItens.map((i) => ({ ...i, marcado: true }));
    const erros = validarParaAprovar({ itens: marcados, modelos });
    expect(erros).toHaveLength(0);
  });

  it('só exclui como sem mensagem sua se ultimaDeMim for estritamente false e sem CRM/envio', () => {
    const contatoFalse = criarContato('Carlos CLIENTE', { ultimaDeMim: false });
    const contatoUndef = criarContato('Carlos CLIENTE', { ultimaDeMim: undefined });
    const filtros: Filtros = { ...FILTROS_PADRAO, soComMensagemMinha: true };

    expect(aplicarFiltros([contatoFalse], filtros, ctx)[0].decisao.situacao).toBe('excluido');
    expect(aplicarFiltros([contatoFalse], filtros, ctx)[0].decisao.motivo).toBe(MOTIVO_SEM_MENSAGEM_MINHA);

    expect(aplicarFiltros([contatoUndef], filtros, ctx)[0].decisao.situacao).toBe('revisar');
    expect(aplicarFiltros([contatoUndef], filtros, ctx)[0].decisao.motivo).toBe(MOTIVO_SINAL_DESCONHECIDO);
  });
});
