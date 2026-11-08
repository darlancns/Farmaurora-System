-- Follow-Up: o campo "Ordem" (remessa) vira "Nº Remessa" — coluna nova numero_remessa (integer, NOT NULL, default 1).
--
-- ADITIVA: só acrescenta uma coluna (com default 1, então as linhas existentes ficam com 1) e uma CHECK (>= 1).
-- NÃO apaga nem altera a coluna antiga "ordem" (text, "Ordem N" ou NULL): ela fica CONGELADA — o código novo não a
-- lê nem a grava mais. Sem índice e sem unique.
--
-- ORDEM DE APLICAÇÃO: aplicar ESTA migração ANTES do deploy do código. O código novo lê e grava numero_remessa;
-- sem a coluna, salvar ou criar um processo falha.
--
-- A CONVERSÃO DOS DADOS da coluna "ordem" para numero_remessa ("Ordem 2" → 2; NULL → 1) é feita À MÃO e NÃO faz
-- parte deste arquivo, de propósito: se ela estivesse aqui, rodar a migração de novo sobrescreveria remessas
-- que as pessoas já editaram.
--
-- Idempotente: add column if not exists; a constraint só é criada se ainda não existir (consulta em pg_constraint).

alter table public.follow_up add column if not exists numero_remessa integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'follow_up_numero_remessa_minimo'
      and conrelid = 'public.follow_up'::regclass
  ) then
    alter table public.follow_up
      add constraint follow_up_numero_remessa_minimo check (numero_remessa >= 1);
  end if;
end
$$;
