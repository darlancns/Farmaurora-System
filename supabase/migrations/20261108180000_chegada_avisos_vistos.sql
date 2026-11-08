-- Aviso "chegou?" do sino (Follow-Up, item 9): dispensas ("olhinho" / "Marcar como visto") do ADMINISTRADOR.
--
-- ADITIVA: só cria uma tabela nova; não altera nem apaga nada que já existe. NÃO APLICADA por quem escreveu este
-- arquivo: aplicar à mão ANTES do deploy do código do item 9 (server/utils/chegadaAvisosStore.ts). Sem a tabela,
-- ler/gravar as dispensas falha: o sino do administrador mostra o aviso de novo e o olhinho devolve erro (o aviso
-- do operacional responsável não depende desta tabela).
--
-- A dispensa é POR USUÁRIO e vale para a combinação processo + data prevista (YYYY-MM-DD, a data interpretada de
-- follow_up.data_chegada_brasil): se a data for adiada, a data prevista muda e o aviso volta. O aviso em si é
-- DERIVADO do estado do processo (status em_transito + data prevista) e não é guardado aqui.
--
-- Acesso: RLS ligado e SEM policies (como `notificacoes` e `conta_tentativas`): só o cliente admin do servidor
-- (service role) lê e escreve; anon/authenticated/public não acessam. O padrão de privilégios segue
-- 20261105100000_conta_tentativas.sql.
--
-- Idempotente: pode rodar de novo sem perder dispensas (create table if not exists; as demais instruções repetem
-- o mesmo estado).

create table if not exists public.chegada_avisos_vistos (
  usuario_id    uuid        not null references auth.users (id) on delete cascade,
  processo_id   text        not null references public.follow_up (id) on delete cascade,
  data_prevista text        not null,
  created_at    timestamptz not null default now(),
  primary key (usuario_id, processo_id, data_prevista)
);

alter table public.chegada_avisos_vistos enable row level security;
revoke all on table public.chegada_avisos_vistos from public, anon, authenticated;
grant all on table public.chegada_avisos_vistos to service_role;
