import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";

export default function VendorReminders() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: reminders, isLoading, refetch } = trpc.reminders.list.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();
  const [showNewReminderForm, setShowNewReminderForm] = useState(false);

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  if (!user || user.role !== "user") {
    return <div className="p-4">Acesso negado</div>;
  }

  const pendingReminders = reminders?.filter(r => r.status === "pending") || [];
  const completedReminders = reminders?.filter(r => r.status === "completed") || [];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pb-4 border-b">
        <div className="flex items-center gap-3">
          <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663471406798/ebiDeAqNiPYHcVdFoPsqfV/sal_vita_logo_d22b1eb4.webp" alt="Sal Vita" className="h-8 md:h-12" />
          <h1 className="text-xl md:text-3xl font-bold text-blue-900">Meus Lembretes</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/history">
            <Button variant="outline" size="sm">📋 Histórico</Button>
          </a>
          <Button size="sm" onClick={() => setShowNewReminderForm(!showNewReminderForm)}>
            {showNewReminderForm ? "Cancelar" : "Novo Lembrete"}
          </Button>
          <Button size="sm" variant="destructive" onClick={handleLogout}>
            Sair
          </Button>
        </div>
      </div>

      {showNewReminderForm && (
        <Card>
          <CardHeader>
            <CardTitle>Adicionar Novo Lembrete</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">Formulário de novo lembrete (em desenvolvimento)</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">{pendingReminders.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Completos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{completedReminders.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Taxa de Conclusão</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {reminders && reminders.length > 0 
                ? Math.round((completedReminders.length / reminders.length) * 100) 
                : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lembretes Pendentes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : pendingReminders.length > 0 ? (
            <div className="space-y-3">
              {pendingReminders.map((reminder) => (
                <div key={reminder.id} className="p-4 border rounded-lg bg-orange-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-lg">{reminder.clientName}</p>
                      <p className="text-sm text-gray-600">{reminder.clientPhone}</p>
                      <p className="text-sm text-gray-700 mt-2">{reminder.notes}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        Agendado para: {format(new Date(reminder.scheduledDate), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">Marcar Concluído</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">Nenhum lembrete pendente</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lembretes Completos</CardTitle>
        </CardHeader>
        <CardContent>
          {completedReminders.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {completedReminders.map((reminder) => (
                <div key={reminder.id} className="p-3 border rounded-lg bg-green-50 text-sm">
                  <p className="font-semibold">{reminder.clientName}</p>
                  <p className="text-gray-600">{format(new Date(reminder.updatedAt), "dd/MM/yyyy", { locale: ptBR })}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">Nenhum lembrete completo</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
