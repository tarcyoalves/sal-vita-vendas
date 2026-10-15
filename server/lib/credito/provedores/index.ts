import type { ProvedorCredito } from './tipos';
import { provedorSimulado } from './simulado';
import { provedorBoaVistaApifull } from './boavistaApifull';

/** `CREDITO_PROVEDOR=boavista_apifull` liga o real; qualquer outro valor (ou ausente) usa o simulado. */
export function getProvedorCredito(): ProvedorCredito {
  return process.env.CREDITO_PROVEDOR === 'boavista_apifull' ? provedorBoaVistaApifull : provedorSimulado;
}
