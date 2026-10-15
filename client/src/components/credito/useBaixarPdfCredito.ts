import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
import { baixarPdfBase64 } from '../../lib/credito/arquivo';

/** Baixar PDF: `credito.pdf` é query, então usa utils.fetch. Ignora clique repetido enquanto baixa. */
export function useBaixarPdfCredito() {
  const utils = trpc.useUtils();
  const [baixandoId, setBaixandoId] = useState<number | null>(null);
  const ocupado = useRef(false);

  const baixar = useCallback(async (id: number) => {
    if (ocupado.current) return;
    ocupado.current = true;
    setBaixandoId(id);
    try {
      const r = await utils.credito.pdf.fetch({ id }, { staleTime: 0 });
      baixarPdfBase64(r.base64, r.nomeArquivo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível baixar o PDF.');
    } finally {
      ocupado.current = false;
      setBaixandoId(null);
    }
  }, [utils]);

  return { baixar, baixandoId };
}
