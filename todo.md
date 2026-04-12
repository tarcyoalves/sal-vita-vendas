# TODO - Gestão de Vendas - Sal do Brasil

## Fase 1: Planejamento
- [x] Definir schema do banco de dados (users, sellers, reminders, calls, metrics)
- [x] Documentar fluxos de autenticação e autorização
- [x] Definir estrutura de notificações e eventos

## Fase 2: Banco de Dados
- [x] Criar tabela `users` com campos de role (admin/user)
- [x] Criar tabela `sellers` com informações de vendedores
- [x] Criar tabela `call_reminders` com agendamentos
- [x] Criar tabela `call_results` com resultados de ligações
- [x] Criar tabela `daily_metrics` com métricas diárias
- [x] Criar tabela `notifications` para histórico de notificações
- [x] Executar migrations no banco de dados

## Fase 3: Backend - Autenticação e APIs
- [x] Implementar middleware de autorização (admin/user)
- [x] Criar API de gerenciamento de vendedores (CRUD)
- [x] Criar API de lembretes (criar, listar, editar, deletar)
- [x] Criar API de resultados de ligações
- [x] Criar API de métricas e cálculos de performance
- [x] Implementar sistema de notificações
- [x] Escrever testes unitários das APIs

## Fase 4: Frontend - Layout e Autenticação
- [x] Criar layout base com DashboardLayout
- [x] Implementar página de login/autenticação
- [x] Criar navegação diferenciada para admin e vendedor
- [x] Implementar tema visual elegante (cores, tipografia, espaçamento)
- [x] Criar página inicial com redirecionamento por role

## Fase 5: Frontend - Agenda e Lembretes
- [x] Criar componente de agenda visual (dia/semana)
- [x] Implementar formulário de criação/edição de lembretes
- [x] Criar lista de lembretes com filtros
- [x] Implementar funcionalidade de marcar lembrete como concluído
- [x] Criar modal de registro de resultado de ligação

## Fase 6: Dashboards
- [x] Criar dashboard do gestor com métricas gerais
- [x] Implementar gráficos de performance por vendedor
- [x] Criar ranking de vendedores com comparativo (dia/semana/mês)
- [x] Criar dashboard do vendedor com suas métricas pessoais
- [x] Implementar histórico de atividades com filtros

## Fase 7: Integração com IA e Análise de Fraude
- [x] Criar tabela `ai_analysis` para armazenar análises
- [x] Integrar API de IA (análise de padrões)
- [x] Implementar detecção de fraude (fake reminders)
- [x] Criar endpoint de análise de performance por IA
- [x] Gerar relatórios automáticos com insights
- [x] Dashboard com recomendações de IA

## Fase 8: Notificações e Refinamentos
- [x] Implementar notificações automáticas para lembretes próximos
- [x] Implementar alertas para gestor sobre metas não cumpridas
- [x] Criar página de histórico de ligações
- [x] Refinamentos visuais e testes de UX
- [x] Testes finais e correção de bugs

## Fase 9: Entrega Final
- [x] Checkpoint final
- [x] Apresentação do sistema ao usuário
