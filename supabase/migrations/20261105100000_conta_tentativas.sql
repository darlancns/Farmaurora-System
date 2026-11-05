-- Limite de tentativas ERRADAS de senha atual na edição da própria conta ("Minha conta"):
-- POST /api/auth/conta/senha e POST /api/auth/conta/email.
--
-- NÃO APLICADA por quem escreveu este arquivo: rodar à mão no SQL Editor do Supabase, ANTES do deploy do
-- código da Fase D (server/utils/contaLimite.ts). Sem esta migration o código FALHA ABERTO: as operações
-- seguem sem limite e o erro vai pro log — nada quebra, só não limita.
--
-- Conta por usuário (auth.users.id) e por tipo de ação ('senha' | 'email'), só as FALHAS (senha atual
-- incorreta). Acertar a senha zera o contador. Parâmetros (5 falhas em 15 min bloqueiam por 15 min) vêm do
-- código (shared/constants/conta.ts) e entram como argumentos — nada fica fixo aqui.
--
-- Acesso: RLS ligado e SEM policies (como `notificacoes`); só a service role (servidor) lê/escreve, direto
-- ou pelas funções abaixo. anon/authenticated/public não executam nada.
--
-- Idempotente: pode rodar de novo sem perder contadores (create ... if not exists / create or replace).

create table if not exists public.conta_tentativas (
  user_id       uuid        not null references auth.users (id) on delete cascade,
  tipo          text        not null,
  falhas        int         not null default 0,
  janela_inicio timestamptz not null default now(),
  bloqueado_ate timestamptz,
  primary key (user_id, tipo),
  constraint conta_tentativas_tipo_check check (tipo in ('senha', 'email'))
);

alter table public.conta_tentativas enable row level security;
revoke all on table public.conta_tentativas from public, anon, authenticated;
grant all on table public.conta_tentativas to service_role;

-- ── registrar_falha_conta ────────────────────────────────────────────────────
-- Soma UMA falha de forma atômica (um único INSERT ... ON CONFLICT DO UPDATE, sem ler-e-gravar).
--   - sem linha ainda            → cria com 1 falha e abre a janela agora;
--   - janela expirada, ou um bloqueio já vencido → reinicia: 1 falha e janela nova;
--   - já bloqueado (corrida: duas falhas simultâneas) → não mexe, não prolonga o bloqueio;
--   - senão                      → falhas + 1, e ao atingir p_max seta bloqueado_ate = agora + p_bloqueio.
-- Devolve true se, depois desta falha, a conta está bloqueada.
-- Limpeza sem cron: cada chamada apaga as linhas de qualquer usuário que já não importam (sem bloqueio
-- vigente e com a janela vencida).
create or replace function public.registrar_falha_conta(
  p_user     uuid,
  p_tipo     text,
  p_max      int,
  p_janela   interval,
  p_bloqueio interval
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agora     timestamptz := pg_catalog.now();
  v_bloqueado boolean;
begin
  if p_max is null or p_max < 1 then
    raise exception 'p_max deve ser maior ou igual a 1';
  end if;

  delete from public.conta_tentativas c
   where (c.bloqueado_ate is null or c.bloqueado_ate <= v_agora)
     and c.janela_inicio + p_janela <= v_agora;

  insert into public.conta_tentativas as t (user_id, tipo, falhas, janela_inicio, bloqueado_ate)
  values (
    p_user,
    p_tipo,
    1,
    v_agora,
    case when 1 >= p_max then v_agora + p_bloqueio else null end
  )
  on conflict (user_id, tipo) do update
    set falhas = case
          when t.bloqueado_ate is not null and t.bloqueado_ate > v_agora then t.falhas
          when (t.bloqueado_ate is not null and t.bloqueado_ate <= v_agora)
               or t.janela_inicio + p_janela <= v_agora then 1
          else t.falhas + 1
        end,
        janela_inicio = case
          when t.bloqueado_ate is not null and t.bloqueado_ate > v_agora then t.janela_inicio
          when (t.bloqueado_ate is not null and t.bloqueado_ate <= v_agora)
               or t.janela_inicio + p_janela <= v_agora then v_agora
          else t.janela_inicio
        end,
        bloqueado_ate = case
          when t.bloqueado_ate is not null and t.bloqueado_ate > v_agora then t.bloqueado_ate
          when (t.bloqueado_ate is not null and t.bloqueado_ate <= v_agora)
               or t.janela_inicio + p_janela <= v_agora then
            case when 1 >= p_max then v_agora + p_bloqueio else null end
          when t.falhas + 1 >= p_max then v_agora + p_bloqueio
          else null
        end
  returning (bloqueado_ate is not null and bloqueado_ate > v_agora) into v_bloqueado;

  return coalesce(v_bloqueado, false);
end;
$$;

-- ── zerar_falhas_conta ───────────────────────────────────────────────────────
-- Senha atual certa: apaga o contador daquele usuário e tipo.
create or replace function public.zerar_falhas_conta(
  p_user uuid,
  p_tipo text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.conta_tentativas c
   where c.user_id = p_user
     and c.tipo = p_tipo;
end;
$$;

-- ── verificar_bloqueio_conta ─────────────────────────────────────────────────
-- true se existe bloqueio VIGENTE (bloqueado_ate no futuro) para aquele usuário e tipo.
create or replace function public.verificar_bloqueio_conta(
  p_user uuid,
  p_tipo text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1
      from public.conta_tentativas c
     where c.user_id = p_user
       and c.tipo = p_tipo
       and c.bloqueado_ate is not null
       and c.bloqueado_ate > pg_catalog.now()
  );
end;
$$;

-- ── Permissões: só a service role executa ────────────────────────────────────
revoke all on function public.registrar_falha_conta(uuid, text, int, interval, interval) from public, anon, authenticated;
revoke all on function public.zerar_falhas_conta(uuid, text) from public, anon, authenticated;
revoke all on function public.verificar_bloqueio_conta(uuid, text) from public, anon, authenticated;

grant execute on function public.registrar_falha_conta(uuid, text, int, interval, interval) to service_role;
grant execute on function public.zerar_falhas_conta(uuid, text) to service_role;
grant execute on function public.verificar_bloqueio_conta(uuid, text) to service_role;
