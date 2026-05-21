/**
 * Meta Ads Campaign Creator — SAL VITA PREMIUM
 * Uso: META_ACCESS_TOKEN=xxx node scripts/create-meta-campaigns.mjs
 * NUNCA commitar com token no código.
 */

const TOKEN      = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID  || 'act_1825673954292622';
const PIXEL_ID   = process.env.META_PIXEL_ID       || '2209017296169541';
const API_VER    = 'v21.0';
const BASE       = `https://graph.facebook.com/${API_VER}`;

if (!TOKEN) { console.error('❌ META_ACCESS_TOKEN não definido.'); process.exit(1); }

async function api(method, path, body = {}) {
  const url = new URL(`${BASE}${path}`);
  if (method === 'GET') {
    url.searchParams.set('access_token', TOKEN);
    for (const [k, v] of Object.entries(body)) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
  }
  const opts = method === 'GET' ? { method } : {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: TOKEN }),
  };
  const res  = await fetch(url.toString(), opts);
  const data = await res.json();
  if (data.error) throw new Error(`[Meta API] ${data.error.message} (code ${data.error.code})`);
  return data;
}

async function run() {
  // ── 1. Verificar token e buscar página vinculada ──────────────────────────
  console.log('🔍 Verificando token e buscando dados da conta...');
  const me = await api('GET', '/me', { fields: 'id,name' });
  console.log(`   ✅ Usuário: ${me.name} (${me.id})`);

  const pages = await api('GET', '/me/accounts', { fields: 'id,name' });
  if (!pages.data?.length) {
    console.error('❌ Nenhuma Página do Facebook encontrada. Necessário para criar criativos.');
    process.exit(1);
  }
  const page = pages.data[0];
  console.log(`   📄 Página: ${page.name} (${page.id})`);

  // ── 2. Buscar interesses relevantes ──────────────────────────────────────
  console.log('\n🎯 Buscando interesses para targeting...');
  const searches = ['alimentação saudável', 'produtos naturais', 'sal do himalaia', 'vida saudável'];
  const interests = [];
  for (const q of searches) {
    const r = await api('GET', '/search', { type: 'adinterest', q, limit: 2 });
    if (r.data?.length) {
      interests.push(...r.data.slice(0, 1).map(i => ({ id: i.id, name: i.name })));
      console.log(`   ✅ "${q}" → ${r.data[0].name} (${r.data[0].id})`);
    }
  }

  // ── 3. Criar Campanha ─────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  console.log('\n📣 Criando campanha de conversão...');
  const campaign = await api('POST', `/${AD_ACCOUNT}/campaigns`, {
    name: `SAL VITA - Conversões - ${today}`,
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    special_ad_categories: [],
  });
  console.log(`   ✅ Campanha: ${campaign.id}`);

  // ── 4. Criar Ad Set ──────────────────────────────────────────────────────
  console.log('\n👥 Criando conjunto de anúncios...');
  const adSet = await api('POST', `/${AD_ACCOUNT}/adsets`, {
    name: 'Interesse Saúde Natural BR 25-55',
    campaign_id: campaign.id,
    status: 'PAUSED',
    daily_budget: 3000, // R$ 30,00 em centavos
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    promoted_object: {
      pixel_id: PIXEL_ID,
      custom_event_type: 'PURCHASE',
    },
    targeting: {
      geo_locations: { countries: ['BR'] },
      age_min: 25,
      age_max: 55,
      ...(interests.length ? { flexible_spec: [{ interests }] } : {}),
    },
    attribution_spec: [
      { event_type: 'CLICK_THROUGH', window_days: 7 },
      { event_type: 'VIEW_THROUGH',  window_days: 1 },
    ],
  });
  console.log(`   ✅ Ad Set: ${adSet.id}`);

  // ── 5. Criar Criativo ─────────────────────────────────────────────────────
  console.log('\n🎨 Criando criativo...');
  const creative = await api('POST', `/${AD_ACCOUNT}/adcreatives`, {
    name: 'SAL VITA - Criativo Principal',
    object_story_spec: {
      page_id: page.id,
      link_data: {
        link: 'https://premium.salvitarn.com.br',
        message: 'Você sabia que o sal refinado perde até 82 minerais? O SAL VITA PREMIUM é colhido diretamente do mar — integral, natural e rico em nutrientes. 1kg de saúde na sua cozinha. 🌊',
        name: 'Sal Marinho Integral SAL VITA PREMIUM',
        description: 'Frete para todo o Brasil • Compre agora',
        call_to_action: {
          type: 'SHOP_NOW',
          value: { link: 'https://premium.salvitarn.com.br' },
        },
      },
    },
  });
  console.log(`   ✅ Criativo: ${creative.id}`);

  // ── 6. Criar Anúncio ─────────────────────────────────────────────────────
  console.log('\n📢 Criando anúncio...');
  const ad = await api('POST', `/${AD_ACCOUNT}/ads`, {
    name: 'SAL VITA - Anúncio Principal',
    adset_id: adSet.id,
    creative: { creative_id: creative.id },
    status: 'PAUSED',
  });
  console.log(`   ✅ Anúncio: ${ad.id}`);

  // ── Resumo ────────────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════╗
║  ✅ ESTRUTURA CRIADA COM SUCESSO             ║
╠══════════════════════════════════════════════╣
║  Campanha  : ${campaign.id.padEnd(30)} ║
║  Ad Set    : ${adSet.id.padEnd(30)} ║
║  Criativo  : ${creative.id.padEnd(30)} ║
║  Anúncio   : ${ad.id.padEnd(30)} ║
╠══════════════════════════════════════════════╣
║  ⚠️  Tudo criado como PAUSADO               ║
║  Próximo passo: adicionar imagem do produto  ║
║  e ativar no Gerenciador de Anúncios         ║
╚══════════════════════════════════════════════╝
`);
}

run().catch(err => { console.error(`\n❌ Erro: ${err.message}`); process.exit(1); });
