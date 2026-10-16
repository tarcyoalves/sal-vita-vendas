import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
import { baixarPdfBase64 } from '../../lib/credito/arquivo';

/**
 * Baixar PDF: `credito.pdf` (um relatório) e `credito.pdfDocumento` (consolidado do CNPJ) são queries, então usa
 * utils.fetch. Ignora clique repetido enquanto baixa. `baixandoId` = id do relatório individual em download;
 * `baixandoDocumento` = documento do consolidado; `ocupado` = qualquer um dos dois (para desabilitar botões).
 */
export function useBaixarPdfCredito() {
  const utils = trpc.useUtils();
  const [baixandoId, setBaixandoId] = useState<number | null>(null);
  const [baixandoDocumento, setBaixandoDocumento] = useState<string | null>(null);
  const ocupadoRef = useRef(false);

  const baixar = useCallback(async (id: number) => {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setBaixandoId(id);
    try {
      const r = await utils.credito.pdf.fetch({ id }, { staleTime: 0 });
      baixarPdfBase64(r.base64, r.nomeArquivo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível baixar o PDF.');
    } finally {
      ocupadoRef.current = false;
      setBaixandoId(null);
    }
  }, [utils]);

  const baixarDocumento = useCallback(async (documento: string) => {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setBaixandoDocumento(documento);
    try {
      const r = await utils.credito.pdfDocumento.fetch({ documento }, { staleTime: 0 });
      baixarPdfBase64(r.base64, r.nomeArquivo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível baixar o PDF.');
    } finally {
      ocupadoRef.current = false;
      setBaixandoDocumento(null);
    }
  }, [utils]);

  return { baixar, baixandoId, baixarDocumento, baixandoDocumento, ocupado: baixandoId !== null || baixandoDocumento !== null };
}
