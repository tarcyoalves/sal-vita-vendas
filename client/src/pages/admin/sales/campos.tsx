import { INPUT } from '../../../components/premium/admin/adminUi';
import { Campo } from './ui';

/** Campo numérico que aceita apagar (vira NaN até o admin digitar). */
export function CampoNumero({ rotulo, dica, valor, aoMudar, min, max }: {
  rotulo: string; dica?: string; valor: number; aoMudar: (n: number) => void; min?: number; max?: number;
}) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      <input
        type="number" inputMode="numeric" min={min} max={max}
        value={Number.isFinite(valor) ? valor : ''}
        onChange={(e) => aoMudar(e.target.value === '' ? NaN : Number(e.target.value))}
        className={INPUT}
      />
    </Campo>
  );
}

export function CampoTexto({ rotulo, dica, valor, aoMudar, max, placeholder }: {
  rotulo: string; dica?: string; valor: string; aoMudar: (s: string) => void; max?: number; placeholder?: string;
}) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      <input value={valor} onChange={(e) => aoMudar(e.target.value)} maxLength={max} placeholder={placeholder} className={INPUT} />
    </Campo>
  );
}

export const textoOuNulo = (s: string): string | null => (s.trim() ? s.trim() : null);
