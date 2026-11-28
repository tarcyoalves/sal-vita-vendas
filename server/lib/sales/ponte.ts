// Ponte Radar (CRM, só leitura) → prospecção (Premium). Chamada pelo ciclo, sob o "lease" do ciclo.
//
// Para cada candidato Premium com pelo menos um e-mail:
//   companies (por CNPJ) → contacts (um por e-mail) → public_sources (uma por origem) → sales_journeys.
//
// Duplicidade de empresa: `companies.cnpj` NÃO tem índice único (e não vamos criar um em tabela
// existente). O INSERT é `INSERT ... SELECT ... WHERE NOT EXISTS (mesmo CNPJ só dígitos)`. Sozinho
// ele ainda tem corrida (dois comandos simultâneos podem não ver a linha um do outro); por isso:
//   1. só um ciclo grava por vez (lease em `sales_settings`, ver ciclo.ts) — a corrida não acontece
//      entre ciclos;
//   2. se mesmo assim aparecerem duas linhas outbound com o mesmo CNPJ (lease vencido, inserção manual),
//      a próxima passada DETECTA e MESCLA: contatos, fontes, jornadas e mensagens passam para a linha
//      de menor id e as outras ficam `company_validation_status = 'duplicate'` (valor já previsto no
//      schema). Nada é apagado.
// Empresa com o mesmo CNPJ já cadastrada como lead INBOUND (/atacado) é pulada: lead que nos
// procurou não recebe prospecção fria.
import { sql } from 'drizzle-orm';
import { ordersDb } from '../../db/ordersDb';
import { isBlockedEmail } from '../../../shared/blockedEmailDomains';
import { listarCandidatosPremium, type PremiumCandidato } from '../radar/premiumCandidatos';
import { municipioByIbge } from '../radar/geo';
import { normalizarEmail, type JourneyState, type SalesSettings } from '../../../shared/sales';
import { avaliarElegibilidade } from './elegibilidade';
import { pontuar } from './pontuacao';
import {
  canalDoContato, codificarExcertoRadar, confiancaDaFonte, estadoNaPonte, fonteEmailDoRadar, qualifica, somar,
} from './operacoesPuro';
import { compartilhamento, emPedacos, listaSql, supressaoEmLote } from './consultas';

export const PONTE_TAMANHO_PAGINA = 200;
const CHAVE_CURSOR = '_ponte_radar_cursor';

export interface AcumuladorPonte {
  empresasSincronizadas: number;
  contatosNovos: number;
  qualificados: number;
  /** Último motivo de inelegibilidade de cada e-mail avaliado neste ciclo. */
  motivosPorEmail: Map<string, string[]>;
  /** Contagens por empresa (sem contato): sem e-mail, lead inbound. */
  semContato: Record<string, number>;
  avisos: string[];
}

const digitos = (s: string) => s.replace(/\D/g, '');

async function lerCursor(): Promise<string | null> {
  const r = await ordersDb.execute<{ apos: string | null }>(sql`SELECT value->>'aposCnpj' AS apos FROM sales_settings WHERE key = ${CHAVE_CURSOR}`);
  return r.rows[0]?.apos ?? null;
}

async function gravarCursor(apos: string | null, por: string): Promise<void> {
  const v = JSON.stringify({ aposCnpj: apos, em: new Date().toISOString() });
  await ordersDb.execute(sql`
    INSERT INTO sales_settings (key, value, updated_at, updated_by) VALUES (${CHAVE_CURSOR}, ${v}::jsonb, now(), ${por})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
  `);
}

interface EmpresaExistente { id: number; cnpj: string; pipelineType: string }

async function empresasPorCnpj(cnpjs: readonly string[]): Promise<Map<string, EmpresaExistente[]>> {
  const out = new Map<string, EmpresaExistente[]>();
  if (cnpjs.length === 0) return out;
  const r = await ordersDb.execute<{ id: number; cnpj: string; pipeline_type: string }>(sql`
    SELECT id, regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') AS cnpj, pipeline_type
    FROM companies
    WHERE company_validation_status <> 'duplicate'
      AND regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') IN (${listaSql(cnpjs)})
    ORDER BY id
  `);
  for (const row of r.rows) {
    const l = out.get(row.cnpj) ?? [];
    l.push({ id: row.id, cnpj: row.cnpj, pipelineType: row.pipeline_type });
    out.set(row.cnpj, l);
  }
  return out;
}

/** Mescla empresas outbound duplicadas na de menor id. Não apaga nada. */
async function mesclarDuplicadas(canonica: number, duplicadas: readonly number[]): Promise<void> {
  if (duplicadas.length === 0) return;
  const ids = listaSql(duplicadas);
  await ordersDb.execute(sql`UPDATE contacts SET company_id = ${canonica}, updated_at = now() WHERE company_id IN (${ids})`);
  await ordersDb.execute(sql`UPDATE public_sources SET company_id = ${canonica} WHERE company_id IN (${ids})`);
  await ordersDb.execute(sql`UPDATE sales_journeys SET company_id = ${canonica}, updated_at = now() WHERE company_id IN (${ids})`);
  await ordersDb.execute(sql`UPDATE sales_messages SET company_id = ${canonica}, updated_at = now() WHERE company_id IN (${ids})`);
  await ordersDb.execute(sql`UPDATE companies SET company_validation_status = 'duplicate', updated_at = now() WHERE id IN (${ids})`);
}

interface ContatoPlanejado {
  cnpj: string;
  email: string;
  fonte: ReturnType<typeof fonteEmailDoRadar>;
  url: string | null;
}

/** Avaliação de um contato do candidato (sem banco além do que já foi consultado). */
function avaliar(
  c: PremiumCandidato, ct: ContatoPlanejado, settings: SalesSettings,
  extra: { compartilhadoPor: number; supressao: { premium: boolean | null; crm: boolean | null }; jaProspectado: boolean },
) {
  const score = pontuar({
    segmentos: c.segmentos, evidencias: c.sinais, email: ct.email, fonteEmail: ct.fonte,
    temSite: !!c.site, uf: c.uf, ufsDaOnda: settings.ondas.ufs,
  });
  const eleg = avaliarElegibilidade({
    email: ct.email, fonteEmail: ct.fonte, urlFonte: ct.url, compartilhadoPor: Math.max(1, extra.compartilhadoPor),
    empresaAtiva: true, // o Radar só importa estabelecimentos com situação cadastral ativa
    segmentos: c.segmentos, evidencias: c.sinais, uf: c.uf, ufsDaOnda: settings.ondas.ufs,
    supressao: extra.supressao, passo: 0, jaProspectado: extra.jaProspectado, canal: settings.canal,
  });
  return { score, eleg };
}

/**
 * Processa páginas do Radar até acabar ou até `prazoFinal`. Retoma do cursor gravado; ao chegar no
 * fim da base volta ao começo na próxima passada (os dados são reavaliados).
 */
export async function executarPonte(o: { settings: SalesSettings; simular: boolean; prazoFinal: number; por: string; acc: AcumuladorPonte }): Promise<void> {
  const { settings, simular, acc } = o;
  if (settings.ondas.ufs.length === 0) { acc.avisos.push('ponte: nenhuma UF na onda atual'); return; }
  let cursor = await lerCursor();
  for (let pagina = 0; pagina < 200; pagina++) {
    if (Date.now() >= o.prazoFinal) { acc.avisos.push('ponte: prazo do ciclo esgotado; continua no próximo ciclo'); break; }
    const candidatos = await listarCandidatosPremium({ ufs: settings.ondas.ufs, limite: PONTE_TAMANHO_PAGINA, aposCnpj: cursor ?? undefined });
    await processarPagina(candidatos, o);
    const fim = candidatos.length < PONTE_TAMANHO_PAGINA;
    cursor = fim ? null : candidatos[candidatos.length - 1].cnpj;
    if (!simular) await gravarCursor(cursor, o.por);
    if (fim) break;
  }
}

async function processarPagina(candidatos: PremiumCandidato[], o: { settings: SalesSettings; simular: boolean; acc: AcumuladorPonte }): Promise<void> {
  const { settings, simular, acc } = o;
  const comEmail = candidatos.filter((c) => c.emails.length > 0);
  somar(acc.semContato, 'empresa_sem_email', candidatos.length - comEmail.length);
  if (comEmail.length === 0) return;

  // 1. Empresas: existentes (por CNPJ só dígitos), detecção de duplicadas e de lead inbound.
  const cnpjs = [...new Set(comEmail.map((c) => digitos(c.cnpj)))];
  const existentes = await empresasPorCnpj(cnpjs);
  const empresaDe = new Map<string, number>();
  const pular = new Set<string>();
  for (const [cnpj, linhas] of existentes) {
    if (linhas.some((l) => l.pipelineType !== 'outbound')) { pular.add(cnpj); continue; }
    empresaDe.set(cnpj, linhas[0].id);
    if (linhas.length > 1) {
      acc.avisos.push(`ponte: CNPJ ${cnpj} tinha ${linhas.length} empresas; mescladas na #${linhas[0].id}`);
      if (!simular) await mesclarDuplicadas(linhas[0].id, linhas.slice(1).map((l) => l.id));
    }
  }
  somar(acc.semContato, 'ja_e_lead_inbound', pular.size);
  const alvo = comEmail.filter((c) => !pular.has(digitos(c.cnpj)));
  acc.empresasSincronizadas += alvo.length;
  if (alvo.length === 0) return;

  const novas = alvo.filter((c) => !empresaDe.has(digitos(c.cnpj)));
  const linhaEmpresa = (c: PremiumCandidato) => {
    const cidade = municipioByIbge(c.municipioIbge)?.nome ?? null;
    return sql`(${c.razaoSocial}::text, ${c.nomeFantasia}::text, ${c.segmentos[0] ?? null}::text, ${digitos(c.cnpj)}::text, ${c.site}::text, ${cidade}::text, ${c.uf}::text)`;
  };
  if (!simular && novas.length) {
    for (const parte of emPedacos(novas, 100)) {
      const r = await ordersDb.execute<{ id: number; cnpj: string }>(sql`
        INSERT INTO companies (name, trade_name, segment, cnpj, company_validation_status, website, city, state, country,
                               source_type, pipeline_type, pipeline_stage, status)
        SELECT v.name, v.trade_name, v.segment, v.cnpj, 'cnpj_valid', v.website, v.city, v.state, 'BR',
               'radar_receita', 'outbound', 'discovered', 'active'
        FROM (VALUES ${sql.join(parte.map(linhaEmpresa), sql`, `)}) AS v(name, trade_name, segment, cnpj, website, city, state)
        WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = v.cnpj)
        RETURNING id, cnpj
      `);
      for (const row of r.rows) empresaDe.set(row.cnpj, row.id);
    }
  }
  // Atualiza os dados públicos das empresas outbound que já existiam (upsert).
  const jaExistiam = alvo.filter((c) => existentes.has(digitos(c.cnpj)));
  if (!simular && jaExistiam.length) {
    for (const parte of emPedacos(jaExistiam, 100)) {
      await ordersDb.execute(sql`
        UPDATE companies c SET name = v.name, trade_name = v.trade_name, segment = v.segment,
               website = coalesce(v.website, c.website), city = coalesce(v.city, c.city), state = v.state, updated_at = now()
        FROM (VALUES ${sql.join(parte.map(linhaEmpresa), sql`, `)}) AS v(name, trade_name, segment, cnpj, website, city, state)
        WHERE c.pipeline_type = 'outbound' AND c.source_type = 'radar_receita' AND c.company_validation_status <> 'duplicate'
          AND regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = v.cnpj
      `);
    }
  }

  // 2. Contatos planejados: um por e-mail (minúsculo) por empresa.
  const planejados: ContatoPlanejado[] = [];
  for (const c of alvo) {
    const vistos = new Set<string>();
    for (const e of c.emails) {
      const email = normalizarEmail(e.email);
      if (vistos.has(email)) continue;
      vistos.add(email);
      // Domínio bloqueado pelo dono nem entra na base (shared/blockedEmailDomains.ts).
      if (isBlockedEmail(email)) { acc.motivosPorEmail.set(email, ['dominio_bloqueado']); continue; }
      planejados.push({ cnpj: digitos(c.cnpj), email, fonte: fonteEmailDoRadar(e.fonte), url: e.url });
    }
  }
  const emails = [...new Set(planejados.map((p) => p.email))];

  const contatoDe = new Map<string, number>(); // `${companyId}|${email}` → contact id
  if (!simular) {
    const linhasContato = planejados.filter((p) => empresaDe.has(p.cnpj));
    for (const parte of emPedacos(linhasContato, 200)) {
      await ordersDb.execute(sql`
        INSERT INTO contacts (company_id, email, channel_type, is_public_business_contact, source_url)
        SELECT v.company_id, v.email, v.channel_type, TRUE, v.source_url
        FROM (VALUES ${sql.join(parte.map((p) => sql`(${empresaDe.get(p.cnpj) ?? 0}::int, ${p.email}::text, ${canalDoContato(p.fonte)}::text, ${p.url}::text)`), sql`, `)})
             AS v(company_id, email, channel_type, source_url)
        WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.company_id = v.company_id AND lower(c.email) = v.email)
      `);
    }
    const ids = [...new Set(linhasContato.map((p) => empresaDe.get(p.cnpj) ?? 0))];
    for (const parte of emPedacos(ids, 300)) {
      const r = await ordersDb.execute<{ id: number; company_id: number; email: string }>(sql`
        SELECT min(id)::int AS id, company_id, lower(email) AS email FROM contacts
        WHERE company_id IN (${listaSql(parte)}) AND email IS NOT NULL GROUP BY company_id, lower(email)
      `);
      for (const row of r.rows) contatoDe.set(`${row.company_id}|${row.email}`, row.id);
    }

    // 3. Fontes públicas: uma linha por origem (Receita + cada página onde um e-mail foi lido).
    const fontes: Array<{ companyId: number; tipo: string; url: string | null; excerto: string; confianca: number }> = [];
    for (const c of alvo) {
      const companyId = empresaDe.get(digitos(c.cnpj));
      if (!companyId) continue;
      fontes.push({ companyId, tipo: 'radar_receita', url: null, excerto: codificarExcertoRadar(c.segmentos, c.sinais), confianca: confiancaDaFonte('receita') });
      const porOrigem = new Map<string, { fonte: string; url: string | null; emails: string[] }>();
      for (const e of c.emails) {
        if (e.fonte === 'receita') continue;
        const k = `${e.fonte}|${e.url ?? ''}`;
        const g = porOrigem.get(k) ?? { fonte: e.fonte, url: e.url, emails: [] };
        g.emails.push(normalizarEmail(e.email));
        porOrigem.set(k, g);
      }
      for (const g of porOrigem.values()) {
        fontes.push({ companyId, tipo: `radar_${g.fonte}`, url: g.url, excerto: JSON.stringify({ origem: 'radar_premium', emails: g.emails }), confianca: confiancaDaFonte(g.fonte) });
      }
    }
    for (const parte of emPedacos(fontes, 200)) {
      const valores = sql.join(parte.map((f) => sql`(${f.companyId}::int, ${f.tipo}::text, ${f.url}::text, ${f.excerto}::text, ${f.confianca}::int)`), sql`, `);
      await ordersDb.execute(sql`
        INSERT INTO public_sources (company_id, source_type, source_url, raw_excerpt, confidence)
        SELECT v.company_id, v.source_type, v.source_url, v.raw_excerpt, v.confidence
        FROM (VALUES ${valores}) AS v(company_id, source_type, source_url, raw_excerpt, confidence)
        WHERE NOT EXISTS (SELECT 1 FROM public_sources p WHERE p.company_id = v.company_id AND p.source_type = v.source_type
                          AND coalesce(p.source_url, '') = coalesce(v.source_url, ''))
      `);
      // A linha da Receita guarda os sinais atuais (evidências): atualiza.
      await ordersDb.execute(sql`
        UPDATE public_sources p SET raw_excerpt = v.raw_excerpt, captured_at = now()
        FROM (VALUES ${valores}) AS v(company_id, source_type, source_url, raw_excerpt, confidence)
        WHERE v.source_type = 'radar_receita' AND p.company_id = v.company_id AND p.source_type = 'radar_receita'
          AND p.raw_excerpt IS DISTINCT FROM v.raw_excerpt
      `);
    }
  }

  // 4. Compartilhamento, supressão e histórico — consultados em lote.
  const [compart, supressao, jornadasExistentes, prospectados] = await Promise.all([
    compartilhamento(emails),
    supressaoEmLote(emails),
    jornadasPorEmail(emails),
    emailsJaProspectados(emails),
  ]);
  const naPagina = new Map<string, Set<string>>();
  for (const p of planejados) { const s = naPagina.get(p.email) ?? new Set<string>(); s.add(p.cnpj); naPagina.set(p.email, s); }
  const candidatoDe = new Map(alvo.map((c) => [digitos(c.cnpj), c]));

  // 5. Jornadas: insere as novas (ON CONFLICT DO NOTHING: e-mail e contato são únicos) e atualiza
  //    as que estão em IDENTIFIED/QUALIFIED (pontuação, elegibilidade e QUALIFICAR/DESQUALIFICAR).
  type Linha = { companyId: number; contactId: number; email: string; c: PremiumCandidato; p: ContatoPlanejado };
  const novasJ: Array<Linha & { estado: JourneyState; aval: ReturnType<typeof avaliar> }> = [];
  const atualizar: Array<Linha & { seIdentified: JourneyState; seQualified: JourneyState; aval: ReturnType<typeof avaliar> }> = [];
  const jaPlanejado = new Set<string>();
  for (const p of planejados) {
    const c = candidatoDe.get(p.cnpj);
    if (!c) continue;
    const companyId = empresaDe.get(p.cnpj) ?? 0; // 0 só em simulação (empresa ainda não existe)
    const contactId = contatoDe.get(`${companyId}|${p.email}`) ?? 0;
    const aval = avaliar(c, p, settings, {
      compartilhadoPor: Math.max(compart.get(p.email) ?? 0, naPagina.get(p.email)?.size ?? 1),
      supressao: supressao.get(p.email) ?? { premium: null, crm: null },
      jaProspectado: prospectados.has(p.email),
    });
    const q = qualifica(c.segmentos, c.sinais);
    const existente = jornadasExistentes.get(p.email);
    if (existente) {
      if (existente.state !== 'IDENTIFIED' && existente.state !== 'QUALIFIED') continue;
      if (existente.companyId !== companyId && companyId !== 0) continue; // e-mail de outra empresa: a jornada é dela
      if (existente.state === 'IDENTIFIED' && estadoNaPonte('IDENTIFIED', q) === 'QUALIFIED') acc.qualificados += 1;
      acc.motivosPorEmail.set(p.email, aval.eleg.motivos);
      atualizar.push({ companyId, contactId, email: p.email, c, p, aval, seIdentified: estadoNaPonte('IDENTIFIED', q), seQualified: estadoNaPonte('QUALIFIED', q) });
      continue;
    }
    if (jaPlanejado.has(p.email)) continue; // uma jornada por e-mail: fica com a primeira empresa
    jaPlanejado.add(p.email);
    acc.motivosPorEmail.set(p.email, aval.eleg.motivos);
    const estado = estadoNaPonte('IDENTIFIED', q);
    novasJ.push({ companyId, contactId, email: p.email, c, p, estado, aval });
  }

  if (simular) {
    acc.contatosNovos += novasJ.length;
    acc.qualificados += novasJ.filter((n) => n.estado === 'QUALIFIED').length;
    return;
  }

  const agoraIso = new Date().toISOString();
  const json = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;
  const elegJson = (a: ReturnType<typeof avaliar>) => json({ ok: a.eleg.ok, motivos: a.eleg.motivos, versao: a.eleg.versao, em: agoraIso });
  const inseriveis = novasJ.filter((n) => n.companyId > 0 && n.contactId > 0);
  for (const parte of emPedacos(inseriveis, 150)) {
    const r = await ordersDb.execute<{ id: number; state: string }>(sql`
      INSERT INTO sales_journeys (contact_id, company_id, email, state, segments, score, score_reasons, eligibility)
      VALUES ${sql.join(parte.map((n) => sql`(${n.contactId}, ${n.companyId}, ${n.email}, ${n.estado}, ${json(n.c.segmentos)}, ${n.aval.score.score}, ${json(n.aval.score.motivos)}, ${elegJson(n.aval)})`), sql`, `)}
      ON CONFLICT DO NOTHING
      RETURNING id, state
    `);
    acc.contatosNovos += r.rows.length;
    acc.qualificados += r.rows.filter((x) => x.state === 'QUALIFIED').length;
  }
  for (const parte of emPedacos(atualizar, 150)) {
    const valores = sql.join(parte.map((u) => sql`(${u.email}::text, ${u.companyId}::int, ${JSON.stringify(u.c.segmentos)}::jsonb, ${u.aval.score.score}::int,
      ${JSON.stringify(u.aval.score.motivos)}::jsonb, ${JSON.stringify({ ok: u.aval.eleg.ok, motivos: u.aval.eleg.motivos, versao: u.aval.eleg.versao, em: agoraIso })}::jsonb,
      ${u.seIdentified}::text, ${u.seQualified}::text)`), sql`, `);
    // A condição `j.state IN (...)` é reavaliada na linha mais nova (READ COMMITTED): uma jornada que
    // mudou de estado no meio (entrou no lote, respondeu) não é tocada. Mudança de estado sobe state_version.
    await ordersDb.execute(sql`
      UPDATE sales_journeys j SET
        segments = v.segments, score = v.score, score_reasons = v.reasons, eligibility = v.elig,
        state = CASE j.state WHEN 'IDENTIFIED' THEN v.se_identified WHEN 'QUALIFIED' THEN v.se_qualified ELSE j.state END,
        state_version = j.state_version + CASE
          WHEN (CASE j.state WHEN 'IDENTIFIED' THEN v.se_identified WHEN 'QUALIFIED' THEN v.se_qualified ELSE j.state END) <> j.state THEN 1 ELSE 0 END,
        updated_at = now()
      FROM (VALUES ${valores}) AS v(email, company_id, segments, score, reasons, elig, se_identified, se_qualified)
      WHERE j.email = v.email AND j.company_id = v.company_id AND j.state IN ('IDENTIFIED', 'QUALIFIED')
    `);
  }
}

async function jornadasPorEmail(emails: readonly string[]): Promise<Map<string, { id: number; state: string; companyId: number }>> {
  const out = new Map<string, { id: number; state: string; companyId: number }>();
  for (const parte of emPedacos(emails, 400)) {
    const r = await ordersDb.execute<{ id: number; email: string; state: string; company_id: number }>(sql`
      SELECT id, email, state, company_id FROM sales_journeys WHERE email IN (${listaSql(parte)})
    `);
    for (const row of r.rows) out.set(row.email, { id: row.id, state: row.state, companyId: row.company_id });
  }
  return out;
}

async function emailsJaProspectados(emails: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const parte of emPedacos(emails, 400)) {
    const r = await ordersDb.execute<{ email: string }>(sql`
      SELECT DISTINCT lower(to_email) AS email FROM sales_messages
      WHERE status IN ('ACCEPTED', 'UNKNOWN') AND lower(to_email) IN (${listaSql(parte)})
    `);
    for (const row of r.rows) out.add(row.email);
  }
  return out;
}

export function novoAcumuladorPonte(): AcumuladorPonte {
  return { empresasSincronizadas: 0, contatosNovos: 0, qualificados: 0, motivosPorEmail: new Map(), semContato: {}, avisos: [] };
}

