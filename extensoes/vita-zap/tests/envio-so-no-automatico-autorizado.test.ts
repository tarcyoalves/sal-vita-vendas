// Teste de CÓDIGO-FONTE: envio só no modo automático autorizado (0.3.0).
//
// Envio automático pelo WhatsApp Web viola os Termos do WhatsApp e arrisca o bloqueio
// permanente do número (docs/PLANO-CAMPANHAS-WHATSAPP.md, seção 6). O padrão é o modo manual (o
// Enter é do usuário). O dono decidiu, por escrito, oferecer um modo automático OPT-IN. Por isso
// TODO código que aciona o envio fica em src/content/envioAutomatico.ts (uma função exportada,
// `enviarSeAutorizado`), importado só pelo handler do pedido `enviarAutomatico`.
// Se este teste falhar, NÃO "ajuste o teste": mova/remova o código que aciona o envio.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SELETORES } from '../src/content/selectors';

const RAIZ = join(__dirname, '..');
const SRC = join(RAIZ, 'src');

function listar(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? listar(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/** Remove comentários (// e /* *\/) para checar só código. Strings ficam. */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const arquivos = listar(SRC).map((p) => ({ caminho: relative(RAIZ, p).replace(/\\/g, '/'), codigo: semComentarios(readFileSync(p, 'utf8')) }));
const conteudo = arquivos.filter((a) => a.caminho.startsWith('src/content/'));

function ocorrencias(re: RegExp, lista = arquivos): string[] {
  return lista.filter((a) => re.test(a.codigo)).map((a) => a.caminho);
}

const ARQUIVO_ENVIO = 'src/content/envioAutomatico.ts';
const semEnvio = conteudo.filter((a) => a.caminho !== ARQUIVO_ENVIO);
const arquivo = (caminho: string): string => arquivos.find((a) => a.caminho === caminho)?.codigo ?? '';

describe('nenhum código dispara o envio fora do modo automático autorizado', () => {
  it('encontrou os arquivos-fonte (sanidade do teste)', () => {
    expect(arquivos.length).toBeGreaterThan(10);
    expect(conteudo.map((a) => a.caminho)).toContain('src/content/execucao.ts');
  });

  it('nenhum evento de teclado é criado ou disparado em lugar nenhum', () => {
    expect(ocorrencias(/KeyboardEvent|InputEvent|initKeyEvent|keyCode|charCode|\bwhich\s*:/)).toEqual([]);
  });

  it('content script não fala em Enter, keydown/keyup/keypress', () => {
    expect(ocorrencias(/['"`]Enter['"`]|keydown|keyup|keypress|beforeinput/i, conteudo)).toEqual([]);
  });

  it('nenhum seletor/menção ao botão de enviar no content script, exceto em envioAutomatico.ts (e o nome do pedido no handler)', () => {
    // Tira as APIs do Chrome (sendMessage/sendResponse) e os nomes do caminho autorizado.
    const permitidos = /\bsendMessage\b|\bsendResponse\b|\benviarAutomatico\b|\benviarSeAutorizado\b|\.\/envioAutomatico/g;
    const achados = semEnvio.filter((a) => /send|enviar/i.test(a.codigo.replace(permitidos, ''))).map((a) => a.caminho);
    expect(achados).toEqual([]);
  });

  it('nenhum submit/requestSubmit; .click() programático só em envioAutomatico.ts, uma única vez, no botão de enviar do rodapé', () => {
    expect(ocorrencias(/\.submit\s*\(|requestSubmit/)).toEqual([]);
    expect(ocorrencias(/\.click\s*\(/)).toEqual([ARQUIVO_ENVIO]);
    const envio = arquivo(ARQUIVO_ENVIO);
    expect(envio.match(/\.click\s*\(/g)).toHaveLength(1);
    expect(envio.match(/(\w+)\.click\s*\(/)?.[1]).toBe('botao');
    // O botão só vem destes três seletores, todos dentro de '#main footer'.
    const seletores = [...envio.matchAll(/'(#main footer [^']*|#main footer button[^']*)'/g)].map((m) => m[1]);
    expect(seletores.sort()).toEqual(['#main footer [data-icon="send"]', '#main footer button[aria-label="Enviar"]', '#main footer button[aria-label="Send"]'].sort());
    expect(envio).toMatch(/closest\('#main footer'\)/);
  });

  it('dispatchEvent só em dom.ts (evento "input" de campo) e abrir-conversa.ts (clique na linha da lista)', () => {
    expect(ocorrencias(/dispatchEvent\s*\(/).sort()).toEqual(['src/content/abrir-conversa.ts', 'src/content/dom.ts']);
    const dom = arquivos.find((a) => a.caminho === 'src/content/dom.ts')?.codigo ?? '';
    const chamadas = dom.match(/dispatchEvent\s*\([^)]*\)/g) ?? [];
    expect(chamadas.length).toBeGreaterThan(0);
    for (const c of chamadas) expect(c).toMatch(/^dispatchEvent\(new Event\('input'/);
  });

  it('MouseEvent só em abrir-conversa.ts, e abrir-conversa só é usado para abrir a conversa achada na lista', () => {
    expect(ocorrencias(/MouseEvent|PointerEvent/)).toEqual(['src/content/abrir-conversa.ts']);
    expect(ocorrencias(/from '\.\/abrir-conversa'|from "\.\/abrir-conversa"/)).toEqual(['src/content/execucao.ts']);
    const execucao = arquivos.find((a) => a.caminho === 'src/content/execucao.ts')?.codigo ?? '';
    expect(execucao.match(/abrirLinhaDaLista\(([^)]*)\)/g)).toEqual(['abrirLinhaDaLista(candidatas[0])']);
    const abrir = arquivos.find((a) => a.caminho === 'src/content/abrir-conversa.ts')?.codigo ?? '';
    expect(abrir).not.toMatch(/footer|caixaMensagem|querySelector|encontrar/);
  });

  it('execCommand só para inserir/apagar texto (nada de quebra de linha/parágrafo)', () => {
    const usos = arquivos.flatMap((a) => a.codigo.match(/execCommand\s*\(\s*['"][^'"]+['"]/g) ?? []);
    expect(usos.length).toBeGreaterThan(0);
    for (const u of usos) expect(u).toMatch(/execCommand\('(insertText|delete)'/);
  });

  it('sem injeção de código nem APIs que geram teclas reais', () => {
    expect(ocorrencias(/chrome\.debugger|\beval\s*\(|new Function\s*\(|chrome\.input\b/)).toEqual([]);
    // chrome.scripting só para reinjetar o próprio content.js (aba aberta antes da instalação).
    expect(ocorrencias(/chrome\.scripting/)).toEqual(['src/sidepanel/whatsapp.ts']);
    const wa = arquivos.find((a) => a.caminho === 'src/sidepanel/whatsapp.ts')?.codigo ?? '';
    const usos = wa.match(/chrome\.scripting\.[a-zA-Z]+\([^)]*\)/g) ?? [];
    expect(usos).toEqual(["chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })"]);
  });

  it('o protocolo tem UM só pedido que aciona envio: enviarAutomatico', () => {
    const msgs = arquivo('src/shared/mensagens.ts');
    const tipos = [...msgs.matchAll(/tipo: '([a-zA-Z:]+)'/g)].map((m) => m[1]);
    expect(tipos).toEqual(
      expect.arrayContaining(['verificar', 'varrer', 'abrirEColar', 'limparCaixa', 'pararObservacao', 'modoAutomatico', 'enviarAutomatico']),
    );
    expect(tipos.filter((t) => /envi|send/i.test(t) && t !== 'vitaZap:envioDetectado')).toEqual(['enviarAutomatico']);
  });

  it('manifesto não pede permissões que permitiriam digitar/enviar por fora', () => {
    const manifesto = JSON.parse(readFileSync(join(RAIZ, 'public/manifest.json'), 'utf8')) as { permissions?: string[]; host_permissions?: string[] };
    expect(manifesto.permissions ?? []).not.toEqual(expect.arrayContaining(['debugger']));
    for (const p of ['debugger', 'input', 'nativeMessaging']) expect(manifesto.permissions ?? []).not.toContain(p);
    expect(manifesto.host_permissions).toEqual(['https://web.whatsapp.com/*']);
  });
});

describe('cliques permitidos: a linha da lista, o X de limpar a busca e (só em envioAutomatico.ts) o botão de enviar do rodapé', () => {
  const abrirConversa = arquivos.find((a) => a.caminho === 'src/content/abrir-conversa.ts')?.codigo ?? '';
  const execucao = arquivos.find((a) => a.caminho === 'src/content/execucao.ts')?.codigo ?? '';

  it('abrir-conversa.ts exporta exatamente duas funções: abrirLinhaDaLista e limparBuscaPeloX', () => {
    const exportadas = [...abrirConversa.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
    expect(exportadas).toEqual(['abrirLinhaDaLista', 'limparBuscaPeloX']);
  });

  it('só eventos de mouse mousedown/mouseup/click, e só dois pontos de disparo', () => {
    const tipos = [...abrirConversa.matchAll(/'(mouse\w+|click|pointer\w+|key\w+|submit|dblclick|contextmenu)'/g)].map((m) => m[1]);
    expect([...new Set(tipos)].sort()).toEqual(['click', 'mousedown', 'mouseup']);
    expect(abrirConversa.match(/dispararCliqueEm\(/g)?.length).toBe(3); // definição + 2 usos
  });

  it('limparBuscaPeloX só é chamado de execucao.ts, uma vez, sobre o botão achado por seletor de LIMPAR busca', () => {
    expect(ocorrencias(/limparBuscaPeloX\s*\(/).sort()).toEqual(['src/content/abrir-conversa.ts', 'src/content/execucao.ts']);
    expect(execucao.match(/limparBuscaPeloX\(([^)]*)\)/g)).toEqual(['limparBuscaPeloX(botao)']);
    // O botão vem de SELETORES.limparBusca, dentro da coluna da esquerda, fora da lista e fora do rodapé.
    expect(execucao).toMatch(/SELETORES\.limparBusca/);
    expect(execucao).toMatch(/lista\?\.contains\(botao\)/);
    expect(execucao).toMatch(/closest\('footer'\)/);
    expect(execucao.match(/limparBuscaPeloBotao/g)?.length).toBeGreaterThan(0);
  });

  it('os seletores do X identificam LIMPAR busca e nunca o botão de enviar, mic ou rodapé', () => {
    expect(SELETORES.limparBusca.length).toBeGreaterThan(0);
    for (const s of SELETORES.limparBusca) {
      expect(s, s).toMatch(/Limpar|Clear search|x-alt|End icon button/);
      expect(s, s).not.toMatch(/send|enviar|ptt|mic|footer|attach|clip|plus|emoji|submit/i);
    }
    const todos = JSON.stringify(SELETORES);
    expect(todos).not.toMatch(/send|enviar|data-icon="(?:wds-ic-send|ptt|mic)/i);
  });

  it('o único pedido de abertura do chat passa por abrirLinhaDaLista(candidatas[0]) (título da linha)', () => {
    expect(execucao).toMatch(/encontrar\(c\.el, 'tituloLinha'\) \?\? c\.el/);
  });

  it('focus() só existe em dom.ts, protegido por usuarioDigitando()', () => {
    expect(ocorrencias(/\.focus\s*\(/)).toEqual(['src/content/dom.ts']);
    const dom = arquivos.find((a) => a.caminho === 'src/content/dom.ts')?.codigo ?? '';
    expect(dom.match(/\.focus\s*\(/g)).toHaveLength(1);
    const corpoFocar = /function focarComSeguranca[\s\S]*?\n\}/.exec(dom)?.[0] ?? '';
    expect(corpoFocar).toMatch(/usuarioDigitando\(\)[\s\S]*el\.focus\(\)/);
  });

  it('os pedidos da 0.2 continuam no protocolo e só enviarAutomatico aciona envio', () => {
    const msgs = arquivo('src/shared/mensagens.ts');
    const tipos = [...msgs.matchAll(/tipo: '([a-zA-Z:]+)'/g)].map((m) => m[1]);
    expect(tipos).toEqual(expect.arrayContaining(['cancelarAbertura', 'consultarPendencias', 'confirmarPendencias', 'vitaZap:aviso', 'vitaZap:observacaoExpirou']));
    expect(tipos.filter((t) => /envi|send/i.test(t) && t !== 'vitaZap:envioDetectado')).toEqual(['enviarAutomatico']);
  });
});

describe('envioAutomatico.ts: uma função, autorizada, importada só pelo handler de enviarAutomatico', () => {
  const envio = arquivo(ARQUIVO_ENVIO);
  const index = arquivo('src/content/index.ts');

  it('exporta exatamente uma função: enviarSeAutorizado (o resto é tipo)', () => {
    const exportadas = [...envio.matchAll(/export\s+(?:async\s+)?(function|const|let|var|class)\s+(\w+)/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(exportadas).toEqual(['function enviarSeAutorizado']);
    expect(envio).not.toMatch(/export\s*\{|export\s+default/);
  });

  it('só content/index.ts importa envioAutomatico, e só enviarSeAutorizado', () => {
    expect(ocorrencias(/envioAutomatico['"]/).sort()).toEqual(['src/content/index.ts']);
    expect(index.match(/import\s*\{([^}]*)\}\s*from '\.\/envioAutomatico'/)?.[1].trim()).toBe('enviarSeAutorizado');
  });

  it('enviarSeAutorizado só é chamada no case "enviarAutomatico" do handler, que checa modo ligado e token', () => {
    expect(ocorrencias(/enviarSeAutorizado\s*\(/).sort()).toEqual([ARQUIVO_ENVIO, 'src/content/index.ts']);
    expect(index.match(/enviarSeAutorizado\s*\(/g)).toHaveLength(1);
    const caso = /case 'enviarAutomatico':([\s\S]*?)case 'varrer'/.exec(index)?.[1] ?? '';
    expect(caso).toContain('enviarSeAutorizado(');
    expect(caso).toMatch(/modoAutomaticoLigado\(\)/);
    expect(caso).toMatch(/ehTokenEnvio\(pedido\.token\)/);
    // A chamada vem DEPOIS das duas travas.
    expect(caso.indexOf('modoAutomaticoLigado')).toBeLessThan(caso.indexOf('enviarSeAutorizado('));
    expect(caso.indexOf('ehTokenEnvio')).toBeLessThan(caso.indexOf('enviarSeAutorizado('));
  });

  it('a função exige token (nome+texto+campanha, uso único, validade) e o modo ligado ANTES de qualquer clique', () => {
    const corpo = /export async function enviarSeAutorizado[\s\S]*$/.exec(envio)?.[0] ?? '';
    const iClique = corpo.indexOf('.click(');
    for (const exigencia of ['recusaDoToken(', 'tokensUsados.add(', 'modoAutomaticoLigado()', 'contextoValido()', 'tituloAberto()', 'classificarConversaAberta(', 'textoIgualExato(', 'lerAvisoWhatsApp(', 'achouBotaoDeEnviar()']) {
      const i = corpo.indexOf(exigencia);
      expect(i, exigencia).toBeGreaterThan(-1);
      expect(i, exigencia).toBeLessThan(iClique);
    }
    // Tudo síncrono entre a última conferência e o clique.
    expect(corpo.slice(corpo.indexOf('\n'), iClique)).not.toMatch(/\bawait\b|setTimeout|Promise/);
  });

  it('sem teclado: nada de Enter/KeyboardEvent/dispatchEvent em envioAutomatico.ts', () => {
    expect(envio).not.toMatch(/KeyboardEvent|InputEvent|keyCode|dispatchEvent|['"`]Enter['"`]|keydown|keyup|keypress|execCommand/);
  });

  it('o modo manual nunca chama o pedido: só o caminho iniciarContagem → concluirContagem do executor usa enviarAutomatico', () => {
    expect(ocorrencias(/tipo: 'enviarAutomatico'/).sort()).toEqual(['src/shared/mensagens.ts', 'src/sidepanel/executor.ts']);
    const ex = arquivo('src/sidepanel/executor.ts');
    expect(ex.match(/tipo: 'enviarAutomatico'/g)).toHaveLength(1);
    // O pedido está dentro de concluirContagem...
    const corpoConcluir = /private async concluirContagem[\s\S]*?\n  \}\n/.exec(ex)?.[0] ?? '';
    expect(corpoConcluir).toContain("tipo: 'enviarAutomatico'");
    // ...que só é agendada por iniciarContagem...
    expect(ex.match(/concluirContagem\(/g)).toHaveLength(2); // definição + agendamento
    expect(/private async iniciarContagem[\s\S]*?\n  \}\n/.exec(ex)?.[0]).toContain('this.concluirContagem(');
    // ...que só é chamada em passo(), dentro de "if (auto)".
    expect(ex.match(/this\.iniciarContagem\(/g)).toHaveLength(1);
    expect(ex).toMatch(/if \(auto\) \{\s*await this\.iniciarContagem\(/);
    // E concluirContagem relê o banco: modo desligado → não pede.
    expect(corpoConcluir.indexOf('lerAutomatico(')).toBeGreaterThan(-1);
    expect(corpoConcluir.indexOf('lerAutomatico(')).toBeLessThan(corpoConcluir.indexOf("tipo: 'enviarAutomatico'"));
  });
});

describe('versão', () => {
  it('manifest.json e package.json estão na mesma versão (0.3.2)', () => {
    const manifesto = JSON.parse(readFileSync(join(RAIZ, 'public/manifest.json'), 'utf8')) as { version: string };
    const pacote = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as { version: string };
    expect(manifesto.version).toBe(pacote.version);
    expect(pacote.version).toBe('0.3.2');
  });
});

describe('diagnosticar é somente leitura', () => {
  const PROIBIDO = /\.(click|focus|blur|submit|requestSubmit|dispatchEvent|scroll\w*|remove|append\w*|insert\w*|setAttribute|removeAttribute)\s*\(|execCommand|innerHTML\s*=|\.value\s*=|\.textContent\s*=|scrollTop\s*=|Event\(/;
  const FUNCOES_DE_ESCRITA = /\b(escreverNoCampo|limparCampo|abrirLinhaDaLista|abrirEColar|limparCaixa|limparBuscaPeloBotao|buscar|cancelarAbertura|varrerLista)\b/;

  it('content/diagnostico.ts só lê: nenhuma função de escrita/clique e nenhum import de dom/lista/execucao/abrir-conversa', () => {
    const d = arquivos.find((a) => a.caminho === 'src/content/diagnostico.ts')?.codigo ?? '';
    expect(d.length).toBeGreaterThan(100);
    expect(d).not.toMatch(FUNCOES_DE_ESCRITA);
    expect(d).not.toMatch(/from '\.\/(dom|lista|execucao|abrir-conversa|varredura|vigia)'/);
    expect(d).not.toMatch(PROIBIDO);
  });

  it('chat.ts (leitura da conversa, usado pelo diagnóstico) também não escreve nem clica', () => {
    const c = arquivos.find((a) => a.caminho === 'src/content/chat.ts')?.codigo ?? '';
    expect(c).not.toMatch(/escreverNoCampo|limparCampo|abrirLinhaDaLista|execCommand|dispatchEvent|\.click\s*\(/);
  });

  it('o handler "diagnosticar" do content script só chama diagnosticarPagina', () => {
    const idx = arquivos.find((a) => a.caminho === 'src/content/index.ts')?.codigo ?? '';
    const m = /case 'diagnosticar':([\s\S]*?)case '/.exec(idx);
    expect(m).not.toBeNull();
    const corpo = m?.[1] ?? '';
    expect(corpo).toContain('diagnosticarPagina(');
    expect(corpo).not.toMatch(FUNCOES_DE_ESCRITA);
    expect(corpo.match(/\w+\s*\(/g)).toEqual(['diagnosticarPagina(']);
  });

  it('o pedido diagnosticar existe no protocolo e continua sem pedido de envio', () => {
    const msgs = arquivos.find((a) => a.caminho === 'src/shared/mensagens.ts')?.codigo ?? '';
    expect(msgs).toMatch(/tipo: 'diagnosticar'/);
  });
});

describe('o próprio teste pega violações (casos plantados)', () => {
  const amostras = [
    "el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))",
    "document.querySelector('[data-icon=\"send\"]').click()",
    "botao.click()",
    "form.requestSubmit()",
  ];
  it.each(amostras)('detecta: %s', (codigo) => {
    const pegou =
      /KeyboardEvent|InputEvent|keyCode/.test(codigo) || /\.click\s*\(|\.submit\s*\(|requestSubmit/.test(codigo) || /send/i.test(codigo);
    expect(pegou).toBe(true);
  });
});
