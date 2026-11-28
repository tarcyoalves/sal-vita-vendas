import { toast } from 'sonner';
import { trpc } from '../../../lib/trpc';
import { errorMessage } from '../../../components/premium/admin/adminLogic';
import type { SalesSettingKey, SalesSettings } from '../../../../../shared/sales';

type ChaveEditavel = Exclude<SalesSettingKey, 'modo'>;

/** Grava uma configuração (o servidor valida, audita e aplica as regras de segurança). */
export function useSalvarSetting(aoSalvar?: () => void) {
  const utils = trpc.useUtils();
  const m = trpc.sales.settingsSalvar.useMutation({
    onSuccess: () => {
      toast.success('Salvo.');
      utils.sales.settingsLer.invalidate();
      utils.sales.painel.invalidate();
      aoSalvar?.();
    },
    onError: (e) => toast.error(errorMessage(e), { duration: 9000 }),
  });
  return {
    salvar: <K extends ChaveEditavel>(key: K, value: SalesSettings[K]) => m.mutate({ key, value }),
    pendente: m.isPending,
  };
}
