# VITA ZAP CRM: especificação clean-room de CRM sobre o WhatsApp Web

Origem: análise estática (leitura dos pacotes instalados, sem executar nada) de uma extensão de CRM para o WhatsApp Web, versão 1.8.21, chamada aqui de "extensão de referência" (ER). Este documento descreve comportamento, layout e fluxos com palavras próprias. Não contém código, trechos de código, nomes internos de funções, CSS, ícones, imagens nem a marca do produto analisado. Os seletores citados pertencem ao WhatsApp Web, não à ER.

Limites da análise: o analisador automático (REA) leu 8 dos 9 arquivos JavaScript; o maior (cerca de 19 MB, a interface) estourou a memória do analisador e foi lido por busca textual. Tudo marcado como "não verificado" abaixo é inferência. Layout e medidas vêm do print do usuário mais o que o pacote declara; nenhuma tela foi executada.

---

## 1. Inventário de features da ER

Convenções: "Servidor" significa o servidor do fabricante da ER. "Login" significa conta própria da ER. Planos: o gratuito limita 5 abas próprias, 5 respostas automáticas, 5 respostas rápidas, 10 mensagens agendadas, 20 notas e 20 lembretes. O plano básico (cerca de US$ 9,90 por mês) sobe para 10, 10, 10, 20, 50 e 30. Envio em massa, integrações com CRMs externos, tradução com IA ilimitada, chatbot de IA, exportação ampla e sincronização de conversas dependem de planos superiores.

### F01. Abas de triagem com contador (Todas, Não Lidas, Aguardando Resposta, Precisa de Resposta)

- O que o usuário vê: uma faixa de abas em forma de pílula no topo da lista de conversas, cada uma com um número ao lado do nome ("Todas 1327 | Não Lidas 197 | Aguardando Resposta 489 | Precisa de Resposta 838"). A aba ativa fica destacada. No fim da faixa há o "+" (criar aba própria) e um ícone de filtro/configuração. O contador atualiza sozinho, sem recarregar.
- Comportamento: clicar numa aba troca a lista de conversas do próprio WhatsApp para só as conversas daquela categoria. A rolagem, a busca, o abrir e o fechar de conversas continuam sendo os nativos.
- Como detecta (resultado central desta análise):
  - Aguardando Resposta = a última mensagem da conversa foi enviada por mim (o vendedor). Ou seja, estou esperando o cliente.
  - Precisa de Resposta = a última mensagem NÃO é minha (o cliente falou por último). Ou seja, devo uma resposta.
  - Não existe limite de tempo na regra. É só "quem mandou a última mensagem". Conversa sem mensagem alguma cai em "Precisa de Resposta".
  - Prova numérica: 489 + 838 = 1327, igual ao total de "Todas" no print. As duas abas particionam o conjunto inteiro, incluindo grupos e (provavelmente) conversas antigas e encerradas. Por isso o 838 é inflado: inclui grupos, "obrigado" finais e contatos mortos. É a principal fraqueza do desenho e a oportunidade de fazer melhor.
  - Não Lidas = conversa com marca de não lida segundo o modelo interno do WhatsApp, mais uma lista própria de conversas que a ER vê chegarem com mensagem nova.
  - O dado vem do modelo interno de conversas do WhatsApp Web (a propriedade da última mensagem recebida com o campo "é minha" e o contador de não lidas), lido pelo script injetado na página. Ver seção 2.
- Onde guarda: nada é guardado. Tudo é recalculado ao vivo a partir da memória do WhatsApp Web. Não exige login nem servidor (marcar tudo como lido pede login).
- Paga/Login: grátis, sem login.

### F02. Abas de sistema adicionais, ocultáveis

- O que vê: no ícone de filtro/configuração das abas, uma lista de abas que se pode mostrar ou ocultar: Respondeu Automaticamente, 1:1, Grupos, Transmissão, Menções, Clientes, Atribuído a mim e Área de trabalho (sincronizadas com equipe).
- Regras de detecção: 1:1 = conversa individual; Grupos = conversa de grupo; Transmissão = lista de transmissão; Menções = conversa com menção não lida a mim; Respondeu Automaticamente = conversas em que a resposta automática da ER agiu (registro local por usuário).
- Onde guarda: a escolha de abas visíveis fica com a conta (servidor). As classificações são locais.
- Paga/Login: abas do sistema grátis. Atribuído e Área de trabalho exigem login e equipe.

### F03. Abas personalizadas (funil próprio)

- O que vê: botão "+" na faixa de abas abre um pequeno diálogo para dar nome à aba. Há uma escolha de modelos prontos, em que cada modelo é uma lista de etapas separadas por barra vertical: Padrão (Novo, Atribuído, Em andamento, Concluído, Adiar), Negócios (Lead, Contatado, Negociação, Aprovado, Perdido, Ganho, Em espera), Suporte, Pedidos (Novo, Orçamento fornecido, Em andamento, Faturado, Pagamento recebido, Enviado, Concluído) e Outro (livre).
- Comportamento: criar, renomear (nome único, obrigatório), excluir (aviso: excluir apaga a associação de todas as conversas à aba) e reordenar. No menu de cada aba: marcar todos como lidos, importar números do WhatsApp (planilha), ordenar conversas da aba (por avatar, nome ou horário da última conversa), transmissão (ver NÃO COPIAR) e exportar contatos da aba.
- Detecção: a aba não detecta nada. É uma lista de conversas que o usuário monta à mão.
- Onde guarda: servidor (a aba e os ids das conversas dentro dela). Ao colocar uma conversa numa aba, a ER envia ao servidor nome, telefone, foto, o texto da última mensagem do cliente e a hora dela. Vale para a política de privacidade do nosso projeto.
- Paga/Login: exige login. Limite de abas por plano.

### F04. Mover conversa entre abas e ações em lote

- O que vê: uma ação "Adicionar à aba" no contato, e uma barra de ações contextual (F14) com "Mover para aba". No diálogo ao iniciar conversa com não contato há também o campo "aba personalizada".
- Comportamento: uma conversa pode ficar em mais de uma aba. Marcar todos como lidos executa em lote sobre a aba. Mostra mensagem de sucesso ou falha.
- Guarda: servidor. Login: exige.

### F05. Chip de filtro por etiquetas, abaixo da busca

- O que vê: um chip com seta ("etiquetas") ao lado dos chips nativos do WhatsApp (Tudo, Não lidas com contador, Favoritas). Abre uma lista com busca ("Buscar etiquetas"), estado vazio ("Sem resultados"), carregando, e a opção de criar etiqueta nova (nome da etiqueta, campo de texto).
- Observação: Tudo, Não lidas e Favoritas são do WhatsApp (não da ER). O chip de etiquetas é o único acrescentado.
- Detecção: filtra pelas etiquetas atribuídas ao contato na conta da ER, não por etiquetas do WhatsApp Business.
- Guarda: servidor. Login: exige.

### F06. Etiquetas de contato com categoria

- O que vê: no painel do contato, a seção "Marcas associadas" com botão "Adicionar etiqueta". Cada etiqueta tem categoria (tipo) e nome. Mostra as mais usadas na parte inferior. Mensagens: nome obrigatório, nome repetido, criada, excluída.
- Guarda: servidor, por espaço de trabalho. Login: exige.

### F07. Painel de perfil do contato e funil de vendas

- O que vê: um painel lateral à direita da conversa, que pode ficar aberto por padrão (preferência global). Seções: informações do contato (nome, telefone, aniversário, país, sexo), informação de vendas, marcas associadas, informação da empresa (nome, cargo, site, tamanho, telefone, e-mail, endereço) e sincronizar contatos com o telefone.
- Informação de vendas: atividade (marcação marcada, pedido feito, pagamento recebido, pedido enviado), fase (contato inicial, discussões, tomada de decisão, discussão de contrato, fechado ganho, fechado perdido), razão, nível (normal, importante, núcleo) e fonte (Facebook, grupo de WhatsApp, LinkedIn, Instagram, Google, YouTube). Para marcar a fase como fechada pede que o contato já esteja em uma aba personalizada.
- Atenção: a seção chamada "tempo de acompanhamento" NÃO é follow-up de verdade. São dois carimbos somente leitura: quando o contato foi criado e quando foi editado pela última vez. Não há lembrete automático ali.
- Guarda: servidor. Login: exige.

### F08. Notas por contato ("Anotações")

- O que vê: no painel do contato, alternância entre "Anotações" e "Informações básicas". Campo "Adicionar anotação", botões salvar, editar e excluir, lista cronológica. Sem conversa aberta mostra "Selecione um chat".
- Comportamento: texto livre, uma lista de notas por conversa. Uma cópia fica em cache no armazenamento do navegador do WhatsApp Web para abrir rápido.
- Guarda: servidor, com cache local. Login: exige. Limite: 20 notas no plano gratuito.

### F09. Lembretes ("Lembre-me") e central de notificações

- O que vê: ícone de sino/relógio no cabeçalho. Abre um painel com três áreas: Notificações, Caixa de Entrada e Próximo lembrete. Cada item mostra "Acompanhe com" mais o contato. Ações editar e excluir (com confirmação "não pode ser desfeito"). Criar: botão "Criar um lembrete" abre diálogo com título (até 64 caracteres), data e hora. Se a hora já passou, recusa com aviso. Ao salvar mostra "Você será notificado sobre [título] em [data] às [hora]".
- Comportamento: o lembrete é ligado à conversa que estava aberta. Ao vencer, aparece como notificação dentro do WhatsApp Web e entra na caixa de entrada; o usuário pode marcar como lida ou apagar. Só dispara com a aba do WhatsApp Web aberta (o cronômetro roda na página; o detalhe exato do temporizador não foi isolado, não verificado). A extensão tem permissão de alarmes e de notificações do navegador, mas o uso encontrado de alarmes é para telemetria, não para lembretes.
- Guarda: servidor (título, vencimento, id da conversa). Login: exige. Limite: 20 no plano gratuito. Não é envio de mensagem: é só aviso. Por isso é seguro e prioritário para nós.

### F10. Respostas rápidas (modelos de mensagem)

- O que vê: ícone de balão na caixa de digitação e no cabeçalho. Abre uma lista com busca ("Buscar resposta rápida"), botões Editar e Enviar por modelo, "Adicionar novo modelo". Criar modelo: título, conteúdo, e anexos (imagem, vídeo, arquivo). Há modelos de equipe com etiqueta própria.
- Atalho no compositor: digitar um caractere de ativação (o padrão sugerido na tela é o til) ou uma combinação de teclas com Ctrl, Alt ou Command abre um menu flutuante sobre a caixa de texto. Setas escolhem e Enter confirma. As configurações do atalho permitem trocar o caractere, gravar combinação, restaurar o padrão, e avisam de conflito.
- Variáveis: tratamento, nome do perfil do WhatsApp, nome de exibição, empresa, cargo, número, grupo, carimbo de tempo, primeiro nome salvo.
- Comportamento observado: se a caixa já tem texto, pergunta "Manter ou substituir a mensagem atual?" com Substituir, Adicionar ou Cancelar. O botão "Enviar" do modelo envia direto sem passar pela caixa (ver NÃO COPIAR para a alternativa segura).
- Guarda: servidor, com cache no armazenamento da página. Login: exige. Limite: 5 no plano gratuito.

### F11. Mensagem agendada (com envio automático)

- O que vê: ícone de relógio/avião na caixa de digitação. Abre uma lista de agendadas (destinatário, título, hora de início, recorrência, status, mensagem, ações) e o formulário "Agendar nova mensagem". Estados: Pendente, Concluído, Vencido, Reenviado, Verificar envio, Falha no envio. Recorrência: hora, dia, semana, mês, trimestre, semestre, ano. Um aviso na janela da conversa diz "Você tem N mensagens pendentes e N vencidas".
- Como funciona: o envio é feito pelo navegador do vendedor, dentro da própria página. Por isso exige a aba do WhatsApp Web aberta, o computador ligado e uma "aba única" para não duplicar.
- NÃO COPIAR (ver seção 4). Guarda: servidor.

### F12. Agendar evento no Google Agenda

- O que vê: ação "Criar evento no calendário". Diálogo com nome, data e hora de início e fim, local, descrição e mensagem de origem. Alertas: horário incompleto, o cliente ainda não confirmou, fim antes do início, conflito com outro evento. Avisa que lembra 30 minutos antes.
- Requer conectar a conta Google (escopo só de eventos de agenda, apenas no Chrome).
- Guarda: Google Agenda (os dados do evento ficam lá). Login: conta Google. Paga: limite no plano gratuito.

### F13. Barra de ações sugeridas por IA

- O que vê: uma faixa discreta perto da caixa de digitação com ações propostas para a conversa atual: resposta rápida sugerida, mensagem agendada, evento de calendário, salvar nota, definir lembrete, adicionar etiqueta, mover para aba e "ver análise". Cada proposta vem com pré-visualização e botão de confirmar. Há chave de "recomendação automática".
- Como detecta: envia o contexto da conversa (mensagens recentes) ao servidor de IA do fabricante, que devolve a recomendação. Privacidade: conteúdo de mensagens sai do computador.
- Guarda: servidor. Login: exige. Plano pago em parte.

### F14. Tradução de mensagens

- O que vê: ícone de tradução na caixa de digitação e no cabeçalho. Traduz mensagens recebidas (embaixo da bolha, em cor configurável) e a mensagem a enviar. Modos: manual, automático, "traduzir e enviar", "tradução rápida" por atalho. Motores básicos (Google, Microsoft, Tencent) e motores de IA, com troca automática ao esgotar a cota. Aviso de idioma diferente detectado.
- Guarda: preferências no servidor; texto vai ao motor de tradução. Login: básico não, IA sim. Cota por plano.

### F15. Assistente de IA / chatbot com base de conhecimento (responde sozinho)

- O que vê: configurações de IA com fontes (arquivos para treinar), modo base de conhecimento, modelos, regras, "chatbot ativo". Mensagens de limite de respostas por mês.
- NÃO COPIAR: responde ao cliente sem o usuário. Ver seção 4. Servidor. Plano pago.

### F16. Resposta automática (palavras-chave, a todos, por ociosidade)

- O que vê: painel "Automação" com lista de modelos: nome, palavras-chave separadas por barra vertical, tipo (palavra-chave exata/difusa ou "responder a todos"), persona/equipe, status ativo ou pausado. Opções por modelo: dias em que vale, grupos em que vale, intervalo por contato, "arquivar após responder", "ineficaz em chats ativos", citar a mensagem ao responder, bloquear o remetente. Gatilho de ociosidade: só atua depois de N minutos sem o vendedor mexer no computador. Variáveis dinâmicas com primeiro nome.
- Avisa que o navegador precisa ficar aberto e que ligar em dois computadores duplica respostas.
- NÃO COPIAR. Servidor com execução local na página. Plano pago acima do limite gratuito.

### F17. Envio em massa / transmissões

- O que vê: assistente em etapas (Conta, Configuração, Processo, Contatos, Mensagens), seleção por etiqueta ou aba, intervalo aleatório entre envios em segundos, variáveis de personalização, opção de cancelamento de inscrição.
- NÃO COPIAR. Plano Pro ou superior.

### F18. Rastreamento de presença (online/offline)

- O que vê: um aviso pequeno no canto inferior direito por cerca de 3 segundos, sem interromper a conversa: "[nome] está online" e "[nome] ficou offline". Liga e desliga em Automação, aba "Rastreamento de contatos".
- Como detecta: escuta o evento de presença do contato no modelo interno. O WhatsApp só entrega isso para contatos que expõem o "visto por último".
- Guarda: nada. Login: não verificado.

### F19. Conversar com quem não é contato

- O que vê: diálogo "Iniciar nova conversa": código do país, número, opção "editar mensagem antes de enviar (apenas texto)", escolher aba personalizada e escolher modelo de resposta. Mensagem de erro se o número não existe ou está bloqueado.
- Comportamento: abre a conversa pelo número sem salvar contato.

### F20. Importar e exportar contatos, grupos e planilhas

- O que vê: importação de planilha de números (assistente de passos para mapear colunas, modelo de planilha incluso, com aviso de divergência de contagem), exportar contatos de uma aba e exportar participantes de grupo para planilha.
- Guarda: arquivo do usuário. Limite por plano.

### F21. Espaço de trabalho de equipe

- O que vê: aba "Área de trabalho", convites para membros, modelos de mensagem e etiquetas compartilhados, atribuição de conversa ("Atribuído a mim") com botão de aceitar, sincronização de conversas (automática, manual, nenhuma) com diálogo de consentimento dos participantes, compartilhar histórico do chat e compartilhamento ao vivo por link.
- Privacidade: a sincronização envia mensagens e arquivos ao servidor. Papel de administrador e de membro.
- Plano pago.

### F22. Integrações externas

- O que vê: painéis para Google Contatos (sincronização de mão única ou dupla), HubSpot, Salesforce, Zoho e webhook. Mapeamento de campos e sincronização manual ou automática.
- Exige permissão opcional de acesso a hosts. Plano pago.

### F23. Ferramentas de automação: fixar conversas, verificação de números, privacidade, grupos

- O que vê: dentro de Automação: "Fixar conversas" (selecionar contatos da agenda para manter no topo; o limite nativo do WhatsApp é de 3, o objetivo parece ser ultrapassá-lo; não verificado), "Verificar números" (checar quais números têm WhatsApp), "Privacidade" e "Grupos" (exportar membros).
- Parte é de risco para banimento (verificação em massa).

### F24. Preferências globais e barra superior

- O que vê: uma faixa fixa de cerca de 48 px no topo da página. O restante do WhatsApp é encolhido para caber embaixo. Contém atalhos de abrir painel de equipe, tradução, IA, modelos, notificações, aplicativos e conta. Preferências: painel do contato sempre aberto, idioma, "aba única de WhatsApp", modo tela cheia, exibir Google Agenda, exibir eventos agendados.
- Guarda: armazenamento do navegador. Sem login.

### F25. Menu de contexto do navegador

- O que vê: clicando com o botão direito num número em qualquer site, aparece "Enviar mensagem do WhatsApp para [seleção]", que abre o WhatsApp Web naquela conversa. É só abrir a conversa.

### F26. Conta, planos e telemetria

- Painel de usuário: tutorial, preferências, ajuda, faturamento, convites. Não é feature de CRM. Registro: a extensão grava e envia ao servidor eventos de diagnóstico ("observabilidade": se o encaixe da interface funcionou, se os seletores casaram). Item a NÃO copiar em nossa versão.

Total: 26 features (4 de envio automático listadas como F11, F15, F16 e F17, mais comportamentos parciais em F10, F13, F14 e F23).

---

## 2. Pontos técnicos de integração (em prosa)

Estrutura geral. A ER é uma extensão do Chrome no formato Manifest V3. Roda em dois mundos: o "mundo da extensão" (script de conteúdo, isolado) e o "mundo da página" (script injetado, enxerga as variáveis do próprio WhatsApp). Um terceiro componente, o serviço de fundo, cuida de login, rede, armazenamento e mensagens. Há ainda um pequeno script, executado no início do carregamento, que grava um marcador de identidade no armazenamento local da página, e um script menor que roda só no site do fabricante (para reagir a pagamento concluído). O manifesto permite que o site do fabricante converse com a extensão.

Como injeta a UI. Não usa Shadow DOM e não usa iframe de interface. Toda a interface é uma aplicação de componentes (Vue 2, com uma biblioteca de componentes e gerenciador de estado) montada em nós comuns inseridos no DOM do WhatsApp com inserção antes de um nó de referência ou anexação ao corpo. Para não brigar com o WhatsApp, todas as classes de componentes têm prefixo próprio e o CSS é injetado como folha no documento. O layout é ajustado por regras CSS adicionadas à primeira folha de estilos: uma faixa fixa de 48 px no topo (a ER reduz a altura do contêiner raiz do WhatsApp em 48 px ou adiciona um padding superior) e as abas inseridas acima da lista de conversas, com a altura da lista recalculada. Ícones novos (tradução, agendar, respostas rápidas) são inseridos nas barras nativas: a barra de ações do cabeçalho da conversa e o rodapé ao lado da caixa de digitação.

Como acessa os dados. O script de conteúdo injeta, na página, um arquivo da própria extensão (exposto como recurso acessível) por meio de uma tag de script. Esse arquivo embute uma biblioteca aberta de acesso ao WhatsApp Web (do tipo que expõe conversas, mensagens e contatos). Ela obtém o carregador interno de módulos do WhatsApp de duas formas: engancha o vetor global de módulos do empacotador e, se isso falhar, usa um plano B que arma armadilhas nas funções de definição e requisição de módulos e consulta a cada 250 ms por até 60 s. Com o carregador em mãos, pega os repositórios internos (conversas, mensagens, contatos, metadados de grupo, miniaturas de perfil) e os expõe em variáveis globais da página. A partir daí a ER lê campos como: id da conversa, última mensagem recebida (com o campo de quem enviou), contador de não lidas, indicador de menção não lida, e se é conversa individual, grupo ou transmissão.

Comunicação entre as partes. Página e script de conteúdo trocam mensagens pelo mecanismo de mensagens da janela (envelopes com origem, destino, tipo e carga). Os tipos incluem: conversa ativa mudou, filtro de lista, mensagem nova, lista de não lidas, dados de contatos, "WhatsApp logado". O script de conteúdo fala com o serviço de fundo por mensagens de runtime. O estado do usuário fica no armazenamento local da extensão, separado por id de usuário, e alguns caches (modelos, notas, configuração) ficam no armazenamento local da própria página do WhatsApp.

Como reage a mudanças. Combinação de: observadores de mutação (cerca de 14 no script de conteúdo) para detectar quando o WhatsApp recria o contêiner; observadores de interseção e redimensionamento para posicionar elementos; um sondador a cada 150 ms que lê o texto do campo de busca para manter a lista filtrada coerente com a busca; e, principalmente, assinaturas de eventos do modelo interno (mensagem nova, mudança do contador de não lidas, mudança da última mensagem recebida, mudança da conversa ativa, mudança de presença). Os contadores das abas são recalculados nesses eventos, não lendo o DOM.

Como filtra a lista sem esconder linhas. Em vez de ocultar elementos, a ER coloca a lista de conversas nativa em modo "personalizado" com a lista de ids permitidos. É o mesmo mecanismo que o WhatsApp usa para seus próprios chips de filtro. Assim a virtualização, a rolagem e os cliques funcionam como sempre.

Seletores do WhatsApp Web que a ER usa (citados por serem do WhatsApp). Estáveis: o painel lateral `#side`, o painel principal `#main`, a tela principal `[data-testid='wa-web-main-screen']`, o painel de mensagens `[data-testid='conversation-panel-messages']`, o contêiner da conversa `[data-testid='conversation-panel-wrapper']`, o corpo `[data-testid='conversation-panel-body']`, o cabeçalho `[data-testid='conversation-header']`, cada mensagem `[data-testid='msg-container']`, linhas `[role='row']`, a lista de filtros nativa `div[role='tablist'][aria-label='chat-list-filters']`, a caixa de texto `div[role='textbox'][contenteditable='true'][data-lexical-editor='true']` (editor Lexical, contêiner `.lexical-rich-text-input`), a área editável `#main .copyable-area [contenteditable='true'][role='textbox']`, o ícone de envio `span[data-icon='wds-ic-send-filled']`, ícones `span[data-icon='delete']` e de fechar, e janelas modais `[data-animate-modal-popup='true']`. Instáveis: dezenas de classes ofuscadas de dois tipos (prefixo "x" seguido de hash e prefixos "_a..."), que mudam a cada versão do WhatsApp.

Fragilidade e resposta do fabricante. A ER mantém uma lista de seletores por âncora (lista de conversas, cabeçalho, barra de ícones, caixa de texto, etc.) baixada do servidor, com cópia embutida de reserva e várias alternativas por âncora. Depois de montar, ela confere se o seletor casou com exatamente um elemento e, se falhar, reporta o problema. Lição: para o nosso produto, preferir data-testid, role e aria-label, e tratar classes ofuscadas só como último recurso.

Servidor. Dados de abas, etiquetas, notas, lembretes, respostas rápidas, agendamentos e automações ficam no servidor do fabricante, com login. Envio de arquivos usa armazenamento de objetos em nuvem de terceiros. A extensão também pede, de forma opcional, acesso a todos os sites e à API de gerenciamento de extensões, além de permissões de cookies, identidade (Google) e escopo de agenda.

Fatos que importam para a nossa decisão de arquitetura:
1. A parte de triagem (F01) funciona 100% local e sem login. Dá para replicar sem servidor.
2. Ler o modelo interno do WhatsApp exige injetar código na página e usar módulos internos. É preciso e dá contadores exatos, mas é frágil a cada atualização e é uma área cinzenta quanto aos termos do WhatsApp. Alternativa de menor risco em 3.2.
3. A parte de lembretes e notas pode ser 100% local (armazenamento do navegador) ou no ERP da Vita. Não precisa de servidor de terceiros.

---

## 3. Prioridades para o vendedor que não quer perder cliente por esquecimento

### 3.1 Tabela

| Feature | Prioridade | Justificativa |
|---|---|---|
| Aba "Precisa de resposta" (cliente falou por último) com contador | ALTA | É a lista do que está devendo. Resolve o esquecimento mais direto. Local, sem servidor. |
| Lembrete de follow-up por conversa (data e hora, título curto, aviso dentro do WhatsApp Web, com rascunho opcional) | ALTA | Transforma "depois eu retorno" em compromisso. Seguro, não envia nada. |
| Aba "Aguardando resposta" com tempo decorrido, e filtro "sem resposta há X dias" | ALTA | A ER não tem tempo. O nosso diferencial: a última mensagem é minha há mais de X dias. É o cliente que esfria. |
| Central de lembretes vencidos e de hoje (caixa de entrada) | ALTA | Sem ela o lembrete se perde se o aviso passar com a aba fechada. |
| Notas por contato | ALTA | Memória do que foi combinado: preço, prazo, objeção. Barata e local. |
| Etiquetas de contato (com cores) e filtro por etiqueta | ALTA | Segmenta clientes (quente, orçamento enviado, cliente fiel). |
| Fase do funil como aba personalizada ou campo (Lead, Orçamento, Negociação, Ganho, Perdido) | MÉDIA | Organiza, mas o esquecimento é resolvido antes pelos itens acima. |
| Botão "concluir/dispensar" para tirar conversa de "Precisa de resposta" | MÉDIA | Corrige o ruído de 838 conversas. Sem isso a aba vira lixo e deixa de ser usada. |
| Excluir grupos, listas de transmissão e arquivadas da triagem por padrão | ALTA | Pré-requisito para a aba "Precisa de resposta" ser confiável. |
| Respostas rápidas (inserir no campo, sem enviar) com atalho no campo de texto | MÉDIA | Ganha tempo, não evita esquecimento. |
| Aba "Não lidas" | BAIXA | O WhatsApp já tem filtro nativo. |
| Abas 1:1, Grupos, Menções | BAIXA | Nativo ou de pouco valor. |
| Painel de perfil do contato (empresa, cargo, endereço) | MÉDIA | Útil para cadastro, mas a Vita já tem ERP. Integrar com o ERP vale mais do que replicar. |
| Exportar lista (CSV) de conversas de uma aba | MÉDIA | Prestação de contas e relatórios. |
| Criar evento no Google Agenda | BAIXA | Útil em visitas, mas o lembrete cobre. |
| Tradução | BAIXA | Fora do foco de venda B2B local. |
| Presença online/offline | BAIXA | Distrai e não ajuda em esquecimento. |
| Conversar com não contato por número | MÉDIA | Poupa salvar contato para falar com lead novo. É só abrir a conversa. |
| Sugestões por IA de próxima ação | BAIXA | Manda texto de conversa a servidor externo. Só consideraria opcional e local. |
| Workspace de equipe, atribuição e compartilhamento | BAIXA | Fora do escopo atual (um vendedor, um número). |
| Integrações HubSpot, Salesforce, Zoho | BAIXA | Não usamos. O destino é o ERP da Vita. |
| Fixar conversas além do limite do WhatsApp | BAIXA | Marginal. |

### 3.2 Regras de detecção recomendadas

- Dado de base: quem enviou a última mensagem útil e quando foi enviada. Duas opções de leitura: (A) o modelo interno do WhatsApp, exato porém frágil e em área cinzenta quanto aos termos; (B) leitura somente do DOM visível da lista de conversas (prévia, ícone de confirmação de entrega da última mensagem, hora na linha), mais leve em risco e mais simples, com a limitação de só enxergar linhas já renderizadas pela virtualização. Recomendação: começar por (B) e guardar localmente o instante em que cada conversa foi vista pela última vez com cada estado, para calcular "há quantos dias".
- Precisa de resposta: última mensagem recebida, conversa individual, não arquivada, não dispensada, e (opcional) com pelo menos N minutos sem resposta para evitar piscar enquanto o vendedor está digitando.
- Aguardando resposta: última mensagem enviada por mim, individual.
- Sem resposta há X dias: aguardando resposta e (agora menos o horário da minha última mensagem) maior que X dias. Padrão sugerido: 2 dias para orçamento aberto, 7 dias para lead frio, configurável por etiqueta.
- Casos de borda a tratar: mensagem de sistema (entrou, saiu, criptografia), reação, figurinha, áudio, mensagem apagada, mensagem minha enviada pelo celular (conta como minha), conversa vazia, cliente que escreve "obrigado" ou "ok" (permitir dispensa em um clique), e grupo (fora por padrão).
- Persistência: tudo em armazenamento local da extensão ou no ERP da Vita. Nenhuma mensagem sai do computador.

---

## 4. NÃO COPIAR

Política do projeto: o CRM (abas, lembretes, notas, respostas rápidas) nunca envia mensagem sozinho; nas campanhas o envio é manual por padrão e o envio automático é uma opção desligada de fábrica, isolada em `content/envio-humano.ts` (ver README da extensão). O risco é de banimento do número. Em tudo abaixo, a alternativa é "lembrar e preparar o texto; o usuário confere e aperta Enter". A extensão não deve chamar função interna de envio, não deve clicar o botão de enviar e não deve simular a tecla Enter. A única escrita permitida na caixa de digitação é inserir texto como rascunho.

| Item da ER | Por que não | Alternativa segura |
|---|---|---|
| Mensagem agendada com envio automático e recorrência (F11) | Envia sozinho na hora marcada, inclusive recorrente. Padrão de robô. | "Lembrete com rascunho": na hora marcada aparece o aviso no WhatsApp Web. Um clique abre a conversa e coloca o texto pronto na caixa. O vendedor lê, ajusta e aperta Enter. Se a aba estiver fechada, o lembrete aparece como vencido na central ao abrir. Recorrência vira lembrete recorrente, nunca envio recorrente. |
| Resposta automática por palavra-chave, para todos e por ociosidade (F16) | Responde por conta própria, inclusive quando o vendedor está ausente. | "Resposta sugerida": se a última mensagem do cliente contém a palavra, aparece um chip "Sugerir modelo X". O clique só insere o texto no campo. Nada de responder por ociosidade. |
| Chatbot de IA com base de conhecimento (F15) | Conversa com o cliente sem humano. Também envia conteúdo ao servidor. | "Rascunho assistido" opcional: gera sugestão que fica no campo para revisão. Preferir modelos locais do ERP. Desligado por padrão. |
| Envio em massa e transmissões (F17) | Disparo em larga escala é o gatilho clássico de bloqueio. | "Fila de atendimento": lista de contatos de uma etiqueta ou aba, com botão "Próximo". Abre a conversa e prepara o texto. O vendedor envia cada um à mão, no ritmo humano. Opcional: aviso se passar de um teto diário configurado. |
| Botão "Enviar" direto na resposta rápida (F10) e "Enviar agora" nas ações sugeridas (F13) | Envia sem a revisão humana. | Trocar por "Inserir". Anexos: abrir o seletor para o usuário anexar, nunca anexar e enviar sozinho. |
| "Traduzir e enviar" direto (F14) | Envia automaticamente após traduzir. | "Traduzir e colocar no campo": o texto traduzido substitui o rascunho e o usuário aperta Enter. |
| Gatilhos "arquivar após responder", "bloquear o remetente" e "citar ao responder" dentro de regras automáticas (F16) | Ações automáticas sobre a conversa sem o usuário. Bloquear é destrutivo. | Se arquivar for desejado, oferecer um botão manual. Não bloquear. |
| Verificação em massa de números com WhatsApp e importação para abrir conversas em lote (F23, F20 em parte) | Consulta massiva a números inexistentes sinaliza abuso. | Importar a lista para a fila de atendimento (acima), abrindo um contato por vez. Sem verificação em lote. |
| Presença online/offline (F18) | Monitora comportamento alheio, vigilância. Sem ganho de venda. | Não implementar. |
| Telemetria remota de diagnóstico, lista de seletores baixada do servidor, envio de nome, telefone, foto e texto da última mensagem ao servidor do fabricante, sincronização de histórico (F03, F13, F21, F26) | Privacidade (LGPD) e superfície de ataque. | Tudo local ou no ERP da Vita. Seletores embutidos e versionados no código. |
| Permissões amplas (acesso a todos os sites, cookies, identidade, gerenciamento de extensões) | Desnecessário. | Pedir só o domínio do WhatsApp Web. |

Princípio de teste de aceitação: se o usuário fechar o computador após configurar tudo, nenhuma mensagem pode sair. Todo efeito deve ser aviso, rascunho ou lista.

---

## 5. Observações de layout para o Vita Zap (medidas e cores aproximadas)

- Faixa de abas: pílulas de altura ao redor de 28 a 32 px, rolagem horizontal se não couberem, contador em tom mais claro ao lado do nome. Aba ativa em verde aproximado (tom próximo de #37B64A) e inativas em cinza médio (próximo de #86888A). "+" e filtro alinhados à direita.
- Faixa superior fixa: cerca de 48 px. A ER a usa para o menu de recursos. Em nosso caso é opcional; podemos pôr os ícones só na barra nativa do cabeçalho e dispensar a faixa.
- Barra lateral estreita de ícones com contadores (99+, 10 no print): parece ser a coluna de navegação do próprio WhatsApp (Conversas, Status, etc.) com contadores nativos, não da ER. Não verificado. Não precisamos reproduzir.
- Chips abaixo da busca: Tudo, Não lidas e Favoritas são do WhatsApp. O único chip nosso seria o de etiquetas.
- Painel do contato à direita: cerca de 320 a 360 px, com abas "Notas" e "Dados", e rodapé fixo de lembretes.
- Estados a desenhar sempre: carregando, vazio ("Nenhuma conversa aguardando"), erro de leitura do WhatsApp (seletor não achou), e limite do plano (não se aplica a nós).
- Comportamento de segurança do layout: se o WhatsApp mudar o DOM, a extensão deve sumir em silêncio em vez de quebrar a tela.
