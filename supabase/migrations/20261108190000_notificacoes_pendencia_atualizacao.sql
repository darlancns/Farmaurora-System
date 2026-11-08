-- Avisos ao consultor: nova pendência / nova atualização num processo dele.
--
-- NÃO APLICADA por quem escreveu este arquivo: rodar à mão no SQL Editor do Supabase, ANTES do deploy
-- do código que cria esses avisos (POST/PATCH /api/processos e POST /api/processos/:id/chegada). Sem ela,
-- o INSERT do aviso falha — a gravação do processo continua valendo (a falha só vai pro log do servidor),
-- mas o consultor não é avisado.
--
-- ADITIVA e idempotente (IF NOT EXISTS): só acrescenta dois valores ao enum e uma coluna nula. Nenhuma
-- linha existente muda; recados e contas continuam gravando as mesmas colunas de antes.
--
-- Os dois ALTER TYPE vêm primeiro e sozinhos. O ADD VALUE pode rodar dentro de uma transação (Postgres 12+),
-- mas o valor novo NÃO pode ser usado na mesma transação — e esta migração não o usa (só o código usa).
-- A tabela public.notificacoes e o índice (destinatario_id, lida) já existem e não são tocados.

alter type public.tipo_notificacao add value if not exists 'pendencia_nova';
alter type public.tipo_notificacao add value if not exists 'atualizacao_nova';

-- Processo de origem do aviso (nulo nos recados e nas contas). Apagar o processo apaga os avisos dele.
alter table public.notificacoes
  add column if not exists processo_id text references public.follow_up(id) on delete cascade;
