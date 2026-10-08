#!/usr/bin/env node
/**
 * smbi_criar_pedido_express.mjs — versão MULTI-ITEM (1 a 6 itens) — revisão do arquiteto (08/10/2026).
 *
 * Compatível com o contrato do daemon (smbi_robo_daemon.mjs): recebe `itens: [{produtoId, quantidade,
 * valorSalUnitario}]` e, por compatibilidade, os campos mono-item (produtoId/quantidade/valorSalUnitario).
 * SÓ CRIA pedido novo. Preserva TODAS as travas da ferramenta mono-item: pesos unitários do cadastro,
 * "C. pag. frete motorista" intocado, frete motorista provisório, comissão do cadastro, anti-duplicidade.
 *
 * Correções sobre o candidato anterior:
 *  - regex de data da anti-duplicidade (escape duplicado devolvia 0) → parseDataBR, testada;
 *  - TODOS os itens são validados ANTES da primeira escrita (código, quantidade, preço, limites, repetidos);
 *  - cada linha é conferida por CÓDIGO exato (descrição exata só se a linha não traz código), com quantidade,
 *    valor unitário e subtotal — nunca por substring;
 *  - depois de salvar, os itens reais são relidos da tela do pedido (código, qtd, preço, subtotal) e somados
 *    ao total do cabeçalho; falha → SALVO_COM_DIVERGENCIA (sem retry, sem novo pedido);
 *  - falha depois da 1ª escrita → FALHA_PEDIDO_INCOMPLETO: movsai X (sem retry); SALVO_COM_DIVERGENCIA
 *    nunca é reembrulhada;
 *  - o login (smbi_tester_login.mjs) é carregado sob demanda, para os helpers puros poderem ser testados.
 * O mutex de navegador continua no wrapper oficial (loginTester); esta ferramenta não cria lock próprio.
 */

import fs from 'fs';
import { pathToFileURL } from 'url';

export const SUPORTA_MULTI_ITEM = true;

// ── Helpers PUROS (testados em tests/smbi-multi-item-tool.test.ts) ───────────────────────────────
export const MAX_ITENS = 6;
export const LIMITE_QTD = 200000;     // sacos por item (trava de sanidade, não regra comercial)
export const LIMITE_PRECO = 100000;   // R$ por unidade

export const normTxt = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/** "08/10/2026" ou "08/10/2026 11:00" (Brasília, -03:00) → epoch ms; 0 se não reconhece. */
export function parseDataBR(s) {
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4] || '00'}:${m[5] || '00'}:00-03:00`).getTime() : 0;
}

/** Número em formato brasileiro ("1.920", "12,50", "R$ 1.234,56") ou JS. NaN se não for número. */
export function numeroBR(v) {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').replace(/[R$\s]/g, '');
  if (t === '') return NaN;
  return parseFloat(t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
}

/** Valida o array INTEIRO antes da primeira escrita. Devolve a lista de erros (vazia = ok). */
export function validarItensPedido(itens) {
  const erros = [];
  if (!Array.isArray(itens) || itens.length === 0) return ['Nenhum item informado para o pedido'];
  if (itens.length > MAX_ITENS) erros.push(`Número de itens excede o limite máximo de ${MAX_ITENS} (informados: ${itens.length})`);
  const vistos = new Set();
  itens.forEach((it, i) => {
    const k = i + 1;
    if (!/^\d+$/.test(String(it?.produtoId ?? ''))) { erros.push(`Item ${k}: produtoId inválido ('${it?.produtoId}')`); return; }
    const pid = String(it.produtoId);
    if (vistos.has(pid)) erros.push(`Item ${k}: produto ${pid} repetido no mesmo pedido (some as quantidades antes de enviar)`);
    vistos.add(pid);
    const q = numeroBR(it.quantidade);
    const p = numeroBR(it.valorSalUnitario);
    if (!(q > 0)) erros.push(`Item ${k}: quantidade inválida ('${it.quantidade}')`);
    else if (q > LIMITE_QTD) erros.push(`Item ${k}: quantidade ${q} acima do limite de segurança (${LIMITE_QTD})`);
    if (!(p > 0)) erros.push(`Item ${k}: valorSalUnitario inválido ('${it.valorSalUnitario}')`);
    else if (p > LIMITE_PRECO) erros.push(`Item ${k}: valor unitário ${p} acima do limite de segurança (${LIMITE_PRECO})`);
  });
  return erros;
}

const codigoDaLinha = (l) => String(l['Cód.'] ?? l['ID'] ?? l['Código'] ?? '').trim();

/**
 * Acha a linha da tabela do SMBI que corresponde ao item: CÓDIGO exato. Só quando NENHUMA linha traz código
 * usa a descrição EXATA (normalizada) — nunca substring. null = não achou.
 */
export function localizarLinha(linhas, item, descricaoEsperada = '') {
  const pid = String(item.produtoId);
  const porCodigo = linhas.find((l) => codigoDaLinha(l) === pid);
  if (porCodigo) return porCodigo;
  if (linhas.some((l) => codigoDaLinha(l) !== '')) return null; // há códigos e nenhum bate: não adivinhar
  const d = normTxt(descricaoEsperada);
  if (!d) return null;
  return linhas.find((l) => normTxt(l['Descrição'] || l['Produto'] || '') === d) || null;
}

/** Confere código/quantidade/valor unitário/subtotal de UMA linha contra o item. Lista de divergências. */
export function conferirLinha(linha, item) {
  const dif = [];
  const q = numeroBR(item.quantidade);
  const p = numeroBR(item.valorSalUnitario);
  const qLinha = numeroBR(linha['Qtd'] ?? linha['Quantidade']);
  const pLinha = numeroBR(linha['Valor (R$)'] ?? linha['Valor']);
  const sLinha = numeroBR(linha['Subtotal (R$)'] ?? linha['Subtotal']);
  if (!(Math.abs(qLinha - q) <= 0.001)) dif.push(`quantidade ${linha['Qtd'] ?? linha['Quantidade']} ≠ ${q}`);
  if (!(Math.abs(pLinha - p) <= 0.005)) dif.push(`valor unitário ${linha['Valor (R$)'] ?? linha['Valor']} ≠ ${p.toFixed(2)}`);
  if (!(Math.abs(sLinha - q * p) <= 0.05)) dif.push(`subtotal ${linha['Subtotal (R$)'] ?? linha['Subtotal']} ≠ ${(q * p).toFixed(2)}`);
  return dif;
}

/** Confere o conjunto: mesma quantidade de linhas, cada item achado por código e conferido. */
export function conferirItensSalvos(linhas, itens, descricoes = []) {
  const dif = [];
  if (linhas.length !== itens.length) dif.push(`${linhas.length} linha(s) no SMBI (esperado ${itens.length})`);
  itens.forEach((it, i) => {
    const l = localizarLinha(linhas, it, descricoes[i] || '');
    if (!l) { dif.push(`item ${i + 1}: produto ${it.produtoId} não encontrado entre as linhas do SMBI`); return; }
    conferirLinha(l, it).forEach((d) => dif.push(`item ${i + 1} (produto ${it.produtoId}): ${d}`));
  });
  return dif;
}

async function criarPedidoExpress(dados, opcoes = {}) {
  const {
    pedidoId = null,
    cnpjCliente,
    vendedorDoc = '',
    tipoVenda = 'FOB_ESPECIAL',
    cfop = '6102',
    itens: itensParam = null,
    produtoId,
    quantidade,
    valorSalUnitario,
    freteClienteTon = 0,
    freteMotoristaTon = 0.01,
    condpagSalCod,
    condpagFreteCod,
    dataEntrega = '',
    observacao = ''
  } = dados;
  const { dryRun = false, permitirDuplicado = false } = opcoes;

  if (pedidoId) {
    throw new Error(`Esta ferramenta não altera pedido existente (${pedidoId}). Use smbi_pedido_atualizar.mjs; ` +
      `valores/itens/fretes de pedido existente: pergunte ao Tarcyo. Nada foi feito.`);
  }
  const erros = [];
  const n = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')));
  const docCli = String(cnpjCliente || '').replace(/\D/g, '');
  if (![11, 14].includes(docCli.length)) erros.push(`cnpjCliente inválido ('${cnpjCliente}')`);

  // Suporte a múltiplos itens (1 a 6 itens)
  const itens = Array.isArray(itensParam) && itensParam.length > 0
    ? itensParam
    : (produtoId !== undefined ? [{ produtoId, quantidade, valorSalUnitario }] : []);

  // TODOS os itens são validados antes de qualquer escrita no ERP.
  erros.push(...validarItensPedido(itens));

  if (!['FOB_ESPECIAL', 'FOB', 'CIF'].includes(tipoVenda)) erros.push(`tipoVenda desconhecido ('${tipoVenda}')`);
  if (!/^[56]\d{3}$/.test(String(cfop))) erros.push(`cfop inválido ('${cfop}')`);
  if (!condpagSalCod) erros.push('condpagSalCod (condição de pagamento do sal) não informado');
  if (tipoVenda === 'FOB_ESPECIAL') {
    if (!(n(freteClienteTon) > 0)) erros.push(`FOB_ESPECIAL exige freteClienteTon > 0 (frete cobrado do cliente por tonelada; veio '${freteClienteTon}')`);
    if (!condpagFreteCod) erros.push('FOB_ESPECIAL exige condpagFreteCod (condição de pagamento do frete do cliente)');
  }
  if (dataEntrega && !/^\d{4}-\d{2}-\d{2}$/.test(String(dataEntrega))) erros.push(`dataEntrega deve ser AAAA-MM-DD ('${dataEntrega}')`);
  if (erros.length) throw new Error(`Dados do pedido incompletos/errados — pergunte ao Tarcyo de UMA vez: ${erros.join('; ')}. Nada foi feito.`);

  const { loginTester } = await import('./smbi_tester_login.mjs');
  const { browser, page } = await loginTester();
  try {
    const totalNovo = Math.round(itens.reduce((acc, it) => acc + (n(it.quantidade) * n(it.valorSalUnitario)), 0) * 100) / 100;

    // Trava anti-duplicidade
    if (!permitirDuplicado) {
      const { getGrid } = await import('./smbi_tester_login.mjs');
      const limpa = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const grid = JSON.parse(await getGrid(page, 'movsai', { cols: 36, length: 300, orderCol: 1 }));
      const quando = parseDataBR;
      const agora = Date.now();
      const suspeitos = (grid.data || []).map((l) => Object.values(l).map(limpa))
        .filter((c) => c[9].replace(/\D/g, '') === docCli && !/cancel/i.test(c[14]))
        .filter((c) => {
          const t = quando(c[7]);
          const valor = n(String(c[13]).replace(/[R$\s]/g, ''));
          return (agora - t < 60 * 60 * 1000) || (agora - t < 7 * 864e5 && Math.abs(valor - totalNovo) < 0.05);
        })
        .map((c) => ({ pedido: c[1], criado: c[7], valor: c[13], status: c[14], nfe: c[4] || null }));
      if (suspeitos.length) {
        throw new Error(`POSSÍVEL PEDIDO DUPLICADO para ${docCli}: ${JSON.stringify(suspeitos)}. Confira se o pedido já existe ` +
          `(pode ter sido salvo numa tentativa anterior). Só crie outro com ordem do Tarcyo (--permitir-duplicado). Nada foi feito.`);
      }
    }

    console.log(`\n🚀 [SMBI PEDIDO EXPRESS] Iniciando criação do pedido para CNPJ ${cnpjCliente}...`);

    await page.goto('https://smbi.com.br/smbi/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.Carrega === 'function');

    // 1. Abrir formulário
    await page.evaluate(() => {
      window.Carrega('_form', 'venda_resumida_form.php', 'Venda resumida', 'menu');
    });
    await page.waitForSelector('#clientenome', { state: 'attached', timeout: 30000 });
    await page.waitForTimeout(1500);

    let docId = '';

    // 2. Carregar Cliente e Representante
    await page.evaluate(({ cnpj, repDoc }) => {
      window.Cliente(cnpj, false);
      if (repDoc && typeof window.Vendedor === 'function') {
        window.Vendedor(repDoc);
      }
    }, { cnpj: cnpjCliente.replace(/\D/g, ''), repDoc: vendedorDoc });
    await page.waitForTimeout(3000);

    const cli = await page.evaluate(() => ({
      nome: document.querySelector('#clientenome')?.value || '',
      doc: String(document.querySelector('input[name=clientedoc]')?.value || document.querySelector('#clientedoc')?.value || '').replace(/\D/g, ''),
      cidade: document.querySelector('input[name=xMun]')?.value || '',
      uf: document.querySelector('input[name=UF]')?.value || '',
      xLgr: document.querySelector('input[name=xLgr]')?.value || '',
      xBairro: document.querySelector('input[name=xBairro]')?.value || '',
    }));
    const cliNome = cli.nome;
    if (!cliNome) throw new Error('Cliente não foi carregado pelo window.Cliente()! Cliente cadastrado? (smbi_cliente_novo.mjs) Nada foi salvo.');
    if (cli.doc && cli.doc !== docCli) throw new Error(`O formulário carregou outro cliente (${cli.doc} ${cliNome}), esperado ${docCli}. Nada foi salvo.`);
    console.log(`   -> Cliente carregado: ${cliNome} (${cli.cidade}/${cli.uf})`);
    const avisos = [];
    if (cli.xLgr.trim().length < 2 || cli.xBairro.trim().length < 2) avisos.push(`Endereço do cliente incompleto (logradouro '${cli.xLgr}', bairro '${cli.xBairro}'): a NF-e vai ser BLOQUEADA até corrigir o cadastro.`);

    // 3. Cabeçalho, Fretes e CFOP (Data de Brasília: America/Sao_Paulo)
    const hojeBrasilia = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

    await page.evaluate(({ tipo, cfopVenda, fCliente, fMotorista, dEnt, dHoje }) => {
      const selTipo = document.querySelector('#tipo_venda') || document.querySelector('select[name=tipo_venda]');
      if (selTipo) {
        selTipo.value = tipo;
        selTipo.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const modFrete = document.querySelector('#modFrete');
      if (modFrete) modFrete.value = (tipo === 'CIF') ? '0' : '1';

      const cfopInput = document.querySelector('#cfop_venda') || document.querySelector('input[name=cfop_venda]');
      if (cfopInput) {
        cfopInput.value = cfopVenda;
        cfopInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const dVenda = document.querySelector('input[name=data_venda]');
      if (dVenda) dVenda.value = dHoje;
      const dPed = document.querySelector('input[name=data_pedido]');
      if (dPed) dPed.value = dHoje;
      const dEntregaInput = document.querySelector('input[name=data_entrega]');
      if (dEntregaInput && dEnt) dEntregaInput.value = dEnt;

      const freteCobrado = document.querySelector('#frete') || document.querySelector('input[name=frete]');
      if (freteCobrado) freteCobrado.value = String(fCliente).replace('.', ',');

      const fretePago = document.querySelector('#frete_cliente') || document.querySelector('input[name=frete_cliente]');
      if (fretePago) fretePago.value = String(fMotorista).replace('.', ',');
    }, {
      tipo: tipoVenda,
      cfopVenda: cfop,
      fCliente: freteClienteTon,
      fMotorista: freteMotoristaTon,
      dEnt: dataEntrega,
      dHoje: hojeBrasilia
    });

    await page.waitForTimeout(1500);

    // 4. Inserir Produtos (NUNCA alterar pesos unitários!)
    const produtosForm = [];

    // Invólucro pós-primeiro item: se docId já existir, QUALQUER falha vira FALHA_PEDIDO_INCOMPLETO: movsai X
    try {
      for (let idx = 0; idx < itens.length; idx++) {
        const it = itens[idx];
        const pId = it.produtoId;
        const q = n(it.quantidade);
        const vUnit = n(it.valorSalUnitario);
        const sub = (q * vUnit).toFixed(2).replace('.', ',');
        const vProdStr = vUnit.toFixed(2).replace('.', ',');

        console.log(`   -> Inserindo item ${idx + 1}/${itens.length}: produto ID ${pId} (Qtd: ${q}, Unit: ${vUnit})...`);

        try {
          await page.evaluate((id) => {
            window.BuscacProd(String(id));
          }, pId);
          await page.waitForTimeout(2500);

          await page.evaluate(({ qtd, vProd, sub }) => {
            const qtdEl = document.querySelector('#qtd') || document.querySelector('input[name=qtd]');
            if (qtdEl) {
              qtdEl.value = String(qtd);
              qtdEl.dispatchEvent(new Event('input', { bubbles: true }));
              qtdEl.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const vProdEl = document.querySelector('#vProd') || document.querySelector('input[name=vProd]');
            if (vProdEl) {
              vProdEl.value = vProd;
              vProdEl.dispatchEvent(new Event('input', { bubbles: true }));
              vProdEl.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const subtotalEl = document.querySelector('#subtotal') || document.querySelector('input[name=subtotal]');
            if (subtotalEl) {
              subtotalEl.value = sub;
              subtotalEl.dispatchEvent(new Event('input', { bubbles: true }));
              subtotalEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, { qtd: q, vProd: vProdStr, sub: sub });

          const prodInfo = await page.evaluate(() => {
            const v = (s) => document.querySelector(s)?.value || '';
            return { codigo: v('#cProd') || v('input[name=cProd]'), descricao: v('#xProd') || v('input[name=xProd]') || v('#descricao'), vProd: v('#vProd') || v('input[name=vProd]'), qtd: v('#qtd') || v('input[name=qtd]') };
          });
          produtosForm.push(prodInfo);

          if (!dryRun) {
            // addProd grava o item: a partir do 1º item o pedido EXISTE no SMBI.
            await page.evaluate(() => { window.addProd(); });
            await page.waitForTimeout(3000);

            docId = await page.$eval('#doc', el => el.value).catch(() => '');
            if (!/^\d+$/.test(String(docId))) {
              throw new Error(`O item ${idx + 1} não gerou número de pedido (doc='${docId}'). PARE: o item pode ter criado venda real — confira o grid de vendas.`);
            }

            // Exigência 3: Contar linhas da tabela de itens e exigir idx + 1 linhas
            const linhasTabela = await page.evaluate(() => {
              const th = [...document.querySelectorAll('#tabelaProdutos thead th')].map((x) => x.innerText.trim());
              return [...document.querySelectorAll('#tabelaProdutos tbody tr')].map((tr) => {
                const td = [...tr.querySelectorAll('td')].map((x) => x.innerText.trim());
                const o = {};
                th.forEach((h, i) => { if (h) o[h] = td[i]; });
                return o;
              }).filter((o) => o['Descrição'] !== undefined && String(o['Descrição']).trim() !== '');
            });

            if (linhasTabela.length !== idx + 1) {
              throw new Error(`Tabela de produtos no SMBI tem ${linhasTabela.length} linha(s), esperado ${idx + 1} após adicionar item ${idx + 1}.`);
            }

            // Confere TODAS as linhas já gravadas (não só a nova): código exato, quantidade, valor e subtotal.
            const difLinhas = conferirItensSalvos(linhasTabela, itens.slice(0, idx + 1), produtosForm.map((p) => p.descricao));
            if (difLinhas.length) throw new Error(`Conferência das linhas após o item ${idx + 1}: ${difLinhas.join('; ')}`);

            console.log(`   -> Item ${idx + 1} gravado e conferido na tela. Pedido ID: ${docId} (linhas: ${linhasTabela.length})`);
          }
        } catch (errItem) {
          if (docId) {
            throw new Error(`FALHA_PEDIDO_INCOMPLETO: movsai ${docId} — falha ao inserir item ${idx + 1} (produto ${pId}): ${errItem.message}`);
          }
          throw errItem;
        }
      }

      // 4.5 Comissão
      await page.evaluate(() => {
        const s = document.querySelector('#tipo_venda') || document.querySelector('select[name=tipo_venda]');
        if (s) s.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForTimeout(2000);
      const vend = await page.evaluate(() => ({
        doc: String(document.querySelector('#vendedordoc')?.value || document.querySelector('input[name=vendedordoc]')?.value || '').replace(/\D/g, ''),
        nome: String(document.querySelector('#vendedornome')?.value || '').trim(),
        percentual: String((document.querySelector('#vendedor_percentual') || document.querySelector('input[name=vendedor_percentual]'))?.value || '').trim(),
      }));

      if (vend.doc || vend.nome) {
        const reps = await page.evaluate(async () => {
          const t = await (await fetch('_backend/_controller/_select/_grid/representante_select_grid.php?draw=1&start=0&length=500')).text();
          const limpa = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          return JSON.parse(t).data.map((l) => ({ id: limpa(l[1]), doc: limpa(l[2]).replace(/\D/g, ''), nome: limpa(l[3]), percentual: limpa(l[8]) }));
        });
        const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
        const rep = (vend.doc && reps.find((r) => r.doc && r.doc === vend.doc))
          || reps.find((r) => norm(r.nome) === norm(vend.nome));
        if (!rep) {
          throw new Error(`Representante "${vend.nome || vend.doc}" não encontrado no cadastro de representantes. Comissão não pode ser conferida.`);
        }

        if (/^\d+(,\d+)?$/.test(vend.percentual)) {
          const origem = vend.percentual === rep.percentual ? `cadastro do representante ${rep.nome}` : 'cadastro do CLIENTE para este tipo de venda';
          console.log(`   -> Comissão ${vend.percentual}% (${origem}) — mantida como o SMBI aplicou.`);
        } else {
          if (!/^\d+(,\d+)?$/.test(rep.percentual)) {
            throw new Error(`Cliente sem comissão para o tipo de venda e representante ${rep.nome} sem percentual válido ("${rep.percentual}").`);
          }
          await page.evaluate((pct) => {
            const el = document.querySelector('#vendedor_percentual') || document.querySelector('input[name=vendedor_percentual]');
            if (!el) return;
            el.value = pct;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, rep.percentual);
          const lido = await page.evaluate(() => String((document.querySelector('#vendedor_percentual') || document.querySelector('input[name=vendedor_percentual]'))?.value || '').trim());
          if (lido !== rep.percentual) throw new Error(`Comissão ficou "${lido}", esperado ${rep.percentual}% (representante ${rep.nome}).`);
          console.log(`   -> Comissão vazia; aplicado ${rep.percentual}% do cadastro do representante ${rep.nome}.`);
        }
      }

      if (dryRun) {
        const comissaoForm = await page.evaluate(() => String((document.querySelector('#vendedor_percentual') || document.querySelector('input[name=vendedor_percentual]'))?.value || '').trim());
        return {
          dryRun: true,
          mensagem: 'Conferência OK — NADA foi gravado (os itens não foram adicionados). Rode sem --dry-run para criar.',
          cliente: { doc: docCli, nome: cliNome, cidade: cli.cidade, uf: cli.uf },
          representante: vend.nome || vend.doc || null,
          comissao: comissaoForm,
          produtos: produtosForm,
          totalPrevisto: totalNovo,
          avisos
        };
      }

      // 5. Condições de Pagamento (Sal e Frete)
      console.log(`   -> Configurando condições de pagamento...`);
      await page.evaluate(({ codSal, codFrete, obsText }) => {
        // Condição do Sal
        if (codSal && typeof window.Condicao_pagamento === 'function') {
          window.Condicao_pagamento(String(codSal));
        }

        // REGRA INVIOLÁVEL DO TARCYO: C. pag. frete motorista (#condpag_frete_lista) NUNCA MEXER!
        // Já vem pré-preenchido no pedido como 15 DIAS por padrão. É proibido alterar ou remover!
        // (Não chamar removerCondicao e não limpar os campos do motorista)

        // Condição do Frete do Cliente (Cond. pag. frete)
        if (codFrete && typeof window.Condicao_pagamento_frete === 'function') {
          window.Condicao_pagamento_frete(String(codFrete));
        }

        // Observações
        const obs = document.querySelector('#observacao') || document.querySelector('textarea[name=observacao]');
        if (obs && obsText) obs.value = obsText;
      }, { codSal: condpagSalCod, codFrete: condpagFreteCod, obsText: observacao });

      await page.waitForTimeout(1500);

      // 6. Gerar Parcelas (#dias)
      console.log(`   -> Calculando parcelas...`);
      await page.evaluate(() => {
        const btnDias = document.querySelector('#dias');
        if (btnDias) btnDias.click();
      });
      await page.waitForTimeout(2000);

      const comissaoAntesSalvar = await page.evaluate(() => String((document.querySelector('#vendedor_percentual') || document.querySelector('input[name=vendedor_percentual]'))?.value || '').trim());

      // 7. Salvar Pedido
      console.log(`   -> Gravando pedido no SMBI...`);
      const [resFinaliza] = await Promise.all([
        page.waitForResponse(res => res.url().includes('movsai_update.php') || res.url().includes('movsai_insert.php'), { timeout: 30000 }).catch(() => null),
        page.evaluate(() => {
          if (typeof window.Finaliza === 'function') window.Finaliza('SIM');
          const btnSalvar = document.querySelector('#forfinalizaButton');
          if (btnSalvar) btnSalvar.click();
        })
      ]);

      let resJson = null;
      if (resFinaliza) {
        resJson = await resFinaliza.json().catch(async () => ({ raw: await resFinaliza.text() }));
      }

      await page.waitForTimeout(2000);
      const finalDoc = await page.$eval('#doc', el => el.value).catch(() => docId);

      if (resJson && resJson.retorno === false && /retroativa/i.test(resJson.mensagem || '')) {
        console.log(`   ⚠️ [VALIDAÇÃO DATA] Corrigindo data de entrega para data atual de Brasília no pedido ${finalDoc || docId}...`);
        const [resRetry] = await Promise.all([
          page.waitForResponse(res => res.url().includes('movsai_update.php') || res.url().includes('movsai_insert.php'), { timeout: 30000 }).catch(() => null),
          page.evaluate((dHoje) => {
            const dEnt = document.querySelector('#data_entrega') || document.querySelector('input[name=data_entrega]');
            if (dEnt) {
              dEnt.value = dHoje;
              dEnt.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (typeof window.Finaliza === 'function') window.Finaliza('SIM');
            const btnSalvar = document.querySelector('#forfinalizaButton');
            if (btnSalvar) btnSalvar.click();
          }, hojeBrasilia)
        ]);
        if (resRetry) {
          resJson = await resRetry.json().catch(async () => ({ raw: await resRetry.text() }));
        }
        await page.waitForTimeout(2000);
      }

      const salvo = resJson && (resJson.retorno === true || resJson.retorno === 1 || resJson.retorno === '1');
      if (!salvo) {
        throw new Error(
          `Não consegui confirmar o salvamento do pedido ${finalDoc || docId || ''} ` +
          `(resposta: ${resJson ? JSON.stringify(resJson).slice(0, 200) : 'nenhuma em 30s'}). ` +
          `PARE TODA ESCRITA (regra #9): o pedido foi iniciado — audite o pedido antes de qualquer nova tentativa.`);
      }

      const idFinal = String(resJson.movsai || finalDoc);
      const gravado = await page.evaluate(async (id) => {
        const r = await fetch(`https://smbi.com.br/smbi/_backend/_controller/_select/_ajax/movsai_select_ajax.php?movsai=${id}`);
        return (await r.json())[0] || null;
      }, idFinal);
      const divergencias = [];
      // Releitura REAL dos itens da tela do pedido salvo (não só cabeçalho e total).
      let itensLidos = null;
      try {
        await page.evaluate((n2) => window.Carrega('_form', `venda_resumida_form.php?doc=${n2}`, 'Venda resumida', 'menu'), idFinal);
        await page.waitForSelector('#clientenome', { state: 'attached', timeout: 30000 });
        await page.waitForFunction(() => document.querySelectorAll('#tabelaProdutos tbody tr td').length > 3, null, { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1500);
        itensLidos = await page.evaluate(() => {
          const th = [...document.querySelectorAll('#tabelaProdutos thead th')].map((x) => x.innerText.trim());
          return [...document.querySelectorAll('#tabelaProdutos tbody tr')].map((tr) => {
            const td = [...tr.querySelectorAll('td')].map((x) => x.innerText.trim());
            const o = {};
            th.forEach((h, i2) => { if (h) o[h] = td[i2]; });
            return o;
          }).filter((o) => o['Descrição'] !== undefined && String(o['Descrição']).trim() !== '');
        });
      } catch (eLeitura) {
        divergencias.push(`não consegui reler os itens do pedido salvo (${eLeitura.message})`);
      }
      if (itensLidos) {
        conferirItensSalvos(itensLidos, itens, produtosForm.map((p) => p.descricao)).forEach((d) => divergencias.push(d));
        const somaLinhas = itensLidos.reduce((acc, l) => acc + (numeroBR(l['Subtotal (R$)'] ?? l['Subtotal']) || 0), 0);
        if (Math.abs(somaLinhas - totalNovo) > 0.05) divergencias.push(`soma dos subtotais ${somaLinhas.toFixed(2)} ≠ total previsto ${totalNovo.toFixed(2)}`);
      }
      if (!gravado) divergencias.push('pedido não encontrado na releitura');
      else {
        const f = (v) => parseFloat(v) || 0;
        if (String(gravado.clientedoc || '').replace(/\D/g, '') !== docCli) divergencias.push(`cliente gravado ${gravado.clientedoc} ≠ ${docCli}`);
        if (gravado.tipo_venda !== tipoVenda) divergencias.push(`tipo_venda gravado '${gravado.tipo_venda}' ≠ '${tipoVenda}'`);
        if (String(gravado.cfop_venda) !== String(cfop)) divergencias.push(`CFOP gravado '${gravado.cfop_venda}' ≠ '${cfop}'`);
        if (Math.abs(f(gravado.valortotal) - totalNovo) > 0.05) divergencias.push(`total gravado ${gravado.valortotal} ≠ previsto ${totalNovo.toFixed(2)}`);
        if (tipoVenda === 'FOB_ESPECIAL' && Math.abs(f(gravado.frete) - n(freteClienteTon)) > 0.005) divergencias.push(`frete do cliente gravado ${gravado.frete} ≠ ${freteClienteTon}`);
        if (Math.abs(f(gravado.vendedor_percentual) - (n(comissaoAntesSalvar) || 0)) > 0.005) divergencias.push(`comissão gravada '${gravado.vendedor_percentual}' ≠ formulário '${comissaoAntesSalvar}' (representante ${vend.nome || vend.doc || '-'})`);
      }
      if (divergencias.length) {
        throw new Error(`SALVO_COM_DIVERGENCIA: o pedido ${idFinal} FOI CRIADO, mas: ${divergencias.join('; ')}. NÃO crie outro pedido; avise o Tarcyo.`);
      }

      console.log(`\n✅ PEDIDO ${idFinal} SALVO, CONFIRMADO E RELIDO NO SMBI.`);
      return { pedidoId: idFinal, retorno: resJson, itensAdicionados: itens.length, itensConferidos: itensLidos ? itensLidos.length : 0, avisos };
    } catch (errFluxo) {
      if (docId) {
        if (errFluxo.message.startsWith('SALVO_COM_DIVERGENCIA:')) {
          throw errFluxo;
        }
        const cleanMsg = errFluxo.message.replace(/Nada foi salvo\.?/gi, '').trim();
        if (cleanMsg.startsWith('FALHA_PEDIDO_INCOMPLETO:')) {
          throw errFluxo;
        }
        throw new Error(`FALHA_PEDIDO_INCOMPLETO: movsai ${docId} — ${cleanMsg}`);
      }
      throw errFluxo;
    }
  } finally {
    await browser.close();
  }
}

export { criarPedidoExpress };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const iFile = args.indexOf('--file');
  const iJson = args.indexOf('--json');
  let dados = null;
  try {
    if (iFile >= 0 && args[iFile + 1]) dados = JSON.parse(fs.readFileSync(args[iFile + 1], 'utf-8'));
    else if (iJson >= 0 && args[iJson + 1]) dados = JSON.parse(args[iJson + 1]);
  } catch (e) {
    console.log(JSON.stringify({ ok: false, erro: `JSON inválido: ${e.message}` }, null, 2));
    process.exit(2);
  }
  if (!dados) {
    console.log('Uso: node smbi_criar_pedido_express.multi_item.mjs --file pedido.json | --json \'{...}\'');
    process.exit(2);
  }
  criarPedidoExpress(dados, {
    dryRun: args.includes('--dry-run'),
    permitirDuplicado: args.includes('--permitir-duplicado')
  })
    .then((r) => { console.log(JSON.stringify({ ok: true, ...r }, null, 2)); process.exit(0); })
    .catch((e) => { console.log(JSON.stringify({ ok: false, erro: e.message }, null, 2)); process.exit(1); });
}
