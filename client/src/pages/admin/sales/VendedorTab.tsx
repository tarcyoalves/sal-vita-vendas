import { useState } from 'react';
import { trpc } from '../../../lib/trpc';
import { btn } from '../../../components/premium/admin/adminUi';
import type { SalesAgente } from '../../../../../shared/sales';
import { Aviso, Card, Consulta, Interruptor } from './ui';
import { CampoNumero } from './campos';
import { useSalvarSetting } from './useSalvarSetting';
import KbEditor from './KbEditor';
import ConversasView from './ConversasView';

function Limites({ inicial }: { inicial: SalesAgente }) {
  const [v, setV] = useState(inicial);
  const { salvar, pendente } = useSalvarSetting();
  const valido = [v.maxMensagensPorConversa, v.maxConversasPorDia, v.caixasParaEncaminhar].every(Number.isFinite);
  return (
    <Card titulo="Limites do vendedor virtual">
      <div className="grid gap-3 sm:grid-cols-3">
        <CampoNumero rotulo="Mensagens por conversa" dica="Entre 4 e 60" valor={v.maxMensagensPorConversa} aoMudar={(n) => setV({ ...v, maxMensagensPorConversa: n })} min={4} max={60} />
        <CampoNumero rotulo="Conversas por dia" dica="0 a 5000" valor={v.maxConversasPorDia} aoMudar={(n) => setV({ ...v, maxConversasPorDia: n })} min={0} max={5000} />
        <CampoNumero rotulo="Caixas para chamar você" dica="A partir daqui o pedido vai para o dono" valor={v.caixasParaEncaminhar} aoMudar={(n) => setV({ ...v, caixasParaEncaminhar: n })} min={2} max={1000} />
      </div>
      <div className="mt-2">
        <Interruptor ligado={v.verificacaoSemantica} onChange={(x) => setV({ ...v, verificacaoSemantica: x })} rotulo="Segunda checagem por IA da resposta (recomendado)" />
      </div>
      <button type="button" disabled={pendente || !valido} onClick={() => salvar('agente', v)} className={`${btn.primary} mt-3`}>Salvar limites</button>
    </Card>
  );
}

export default function VendedorTab() {
  const settings = trpc.sales.settingsLer.useQuery();
  const { salvar, pendente } = useSalvarSetting();
  const agente = settings.data?.agente;
  return (
    <div className="space-y-4">
      <Consulta carregando={settings.isLoading} erro={settings.error} refazer={() => settings.refetch()}>
        {agente && (
          <>
            <Card titulo="Vendedor virtual no site">
              <Interruptor ligado={agente.ativo} disabled={pendente} onChange={(x) => salvar('agente', { ...agente, ativo: x })} rotulo={agente.ativo ? 'Ligado: o chat do site atende' : 'Desligado: o chat vira formulário de contato'} />
              {!agente.ativo && <div className="mt-2"><Aviso tom="amber">Com o vendedor desligado, ninguém conversa com o assistente. Os visitantes veem um formulário de contato.</Aviso></div>}
            </Card>
            <Limites key={JSON.stringify(agente)} inicial={agente} />
          </>
        )}
      </Consulta>
      <KbEditor />
      <ConversasView />
    </div>
  );
}
