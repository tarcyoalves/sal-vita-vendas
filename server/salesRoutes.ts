// Rotas REST do Hermes para o Sal Vita Sales AI (contrato: docs/CONTRATO-HERMES-VENDAS.md e shared/sales.ts).
// Cada escopo tem segredo próprio (HERMES_SCOPES); variável ausente = 503 (falha fechado).
// Autentica ANTES de aguardar schema: chamada anônima não acorda o banco.
//
// Ordem em TODA rota: limiter → teto de corpo → portão (autentica, SÓ ENTÃO aguarda o schema) → handler.
// O `express.json({limit:'4mb'})` global de api/index.ts roda antes destas rotas; por isso o teto de
// corpo aqui confere o Content-Length E o tamanho do corpo já lido.
//
// Este arquivo NÃO envia e-mail. Quem envia é o executor do Hermes, com a caixa de envio dele (SMTP);
// as credenciais SMTP vivem só no executor, nunca aqui nem no modelo.
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { getClientIp } from './lib/clientIp';
import { safeErr } from './lib/logSafe';
import {
  autorizarBodySchema, cicloBodySchema, eventoCaixaBodySchema, heartbeatBodySchema, propostaBodySchema, reservarBodySchema,
  resultadoBodySchema, type HermesScope,
} from '../shared/sales';
import {
  LIMITE_CORPO, corpoExcedeLimite, decidirAutenticacao, idDaRota, segredoDoEscopo, tamanhoJson, validarCorpo,
} from './lib/sales/rotasPuro';
import { intervaloRelatorio } from './lib/sales/operacoesPuro';
import { autorizar, eventoCaixa, heartbeat, obterModo, proposta, reservar, resultado, type RespostaRota } from './lib/sales/hermes';
import { executarCiclo, relatorio } from './lib/sales/operacoes';

export interface SalesRoutesDeps {
  aguardarSchemas: (req: Request) => Promise<void>;
}

function limitador(max: number): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(getClientIp(req)),
    message: { error: 'muitas requisições' },
  });
}

function tetoDeCorpo(limite: number): RequestHandler {
  return (req, res, next) => {
    if (corpoExcedeLimite(req.headers['content-length'], limite) || (req.body !== undefined && tamanhoJson(req.body) > limite)) {
      res.status(413).json({ error: 'corpo grande demais' });
      return;
    }
    next();
  };
}

function responder(res: Response, r: RespostaRota): void {
  res.status(r.http).json(r.corpo);
}

/** Envolve o handler: erro inesperado = 500 sem detalhe (o log leva o erro já sem segredo). */
function handler(tag: string, fn: (req: Request) => Promise<RespostaRota>): RequestHandler {
  return (req, res) => {
    fn(req).then((r) => responder(res, r)).catch((err) => {
      console.error(`[sales-api] ${tag} falhou:`, safeErr(err));
      if (!res.headersSent) res.status(500).json({ error: 'erro interno' });
    });
  };
}

export function registerSalesRoutes(app: Express, deps: SalesRoutesDeps): void {
  /**
   * Portão do escopo: primeiro decide a autenticação (sem banco). Só se passou é que aguarda o
   * schema — chamada anônima, com segredo errado ou com o escopo desligado nunca acorda o Neon.
   */
  const portao = (escopo: HermesScope): RequestHandler => (req: Request, res: Response, next: NextFunction) => {
    const auth = decidirAutenticacao(segredoDoEscopo(escopo), req.headers.authorization);
    if (!auth.ok) {
      if (auth.http === 401) console.warn(`[sales-api] ${req.method} ${req.path} → 401 (${escopo})`);
      res.status(auth.http).json(auth.corpo);
      return;
    }
    deps.aguardarSchemas(req).then(() => next(), next);
  };

  const leitura = limitador(60);
  const despacho = limitador(240);
  const caixa = limitador(120);
  const propostas = limitador(30);
  const operacao = limitador(6);
  const sinal = limitador(30);

  app.get('/api/sales/modo', leitura, portao('leitura'), handler('GET modo', () => obterModo()));

  app.post('/api/sales/fila/reservar', despacho, tetoDeCorpo(LIMITE_CORPO.pequeno), portao('despacho'), handler('POST reservar', async (req) => {
    const v = validarCorpo(reservarBodySchema, req.body);
    return v.ok ? reservar(v.dados) : v;
  }));

  app.post('/api/sales/envio/:id/autorizar', despacho, tetoDeCorpo(LIMITE_CORPO.pequeno), portao('despacho'), handler('POST autorizar', async (req) => {
    const id = idDaRota(req.params.id);
    if (id === null) return { http: 400, corpo: { error: 'id inválido' } };
    const v = validarCorpo(autorizarBodySchema, req.body);
    return v.ok ? autorizar(id, v.dados) : v;
  }));

  app.post('/api/sales/envio/:id/resultado', despacho, tetoDeCorpo(LIMITE_CORPO.pequeno), portao('despacho'), handler('POST resultado', async (req) => {
    const id = idDaRota(req.params.id);
    if (id === null) return { http: 400, corpo: { error: 'id inválido' } };
    const v = validarCorpo(resultadoBodySchema, req.body);
    return v.ok ? resultado(id, v.dados) : v;
  }));

  app.post('/api/sales/caixa/eventos', caixa, tetoDeCorpo(LIMITE_CORPO.evento), portao('despacho'), handler('POST eventos', async (req) => {
    const v = validarCorpo(eventoCaixaBodySchema, req.body);
    return v.ok ? eventoCaixa(v.dados) : v;
  }));

  app.get('/api/sales/relatorio', leitura, portao('leitura'), handler('GET relatorio', async (req) => {
    const de = typeof req.query.de === 'string' ? req.query.de : '';
    const ate = typeof req.query.ate === 'string' ? req.query.ate : '';
    const i = intervaloRelatorio(de, ate);
    if (!i.ok) return { http: 400, corpo: { error: i.erro } };
    return { http: 200, corpo: await relatorio({ de, ate }) };
  }));

  app.post('/api/sales/propostas', propostas, tetoDeCorpo(LIMITE_CORPO.proposta), portao('propostas'), handler('POST propostas', async (req) => {
    const v = validarCorpo(propostaBodySchema, req.body);
    return v.ok ? proposta(v.dados) : v;
  }));

  app.post('/api/sales/heartbeat', sinal, tetoDeCorpo(LIMITE_CORPO.pequeno), portao('leitura'), handler('POST heartbeat', async (req) => {
    const v = validarCorpo(heartbeatBodySchema, req.body);
    return v.ok ? heartbeat(v.dados) : v;
  }));

  app.post('/api/sales/ciclo', operacao, tetoDeCorpo(LIMITE_CORPO.pequeno), portao('operacao'), handler('POST ciclo', async (req) => {
    const v = validarCorpo(cicloBodySchema, req.body);
    if (!v.ok) return v;
    return { http: 200, corpo: await executarCiclo({ por: `hermes:${v.dados.executor}`, simular: v.dados.simular }) };
  }));
}
