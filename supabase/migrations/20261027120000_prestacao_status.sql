-- Prestação: status manual ("Em andamento" / "Concluída") em public.prestacao_pacientes.
--
-- NÃO APLICADA por quem escreveu este arquivo: rodar à mão no SQL Editor do Supabase, ANTES do deploy
-- (a coluna nova é inofensiva para o código atual, que nunca a lê nem a grava).
--
-- Idempotente e SEM risco de resetar: o bloco só mexe em algo quando a coluna ainda NÃO existe. Rodar de
-- novo (ou depois de alguém já ter alternado status) não toca em nenhum valor.

do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'prestacao_pacientes'
       and column_name = 'status'
  ) then
    -- 1) Cria a coluna com DEFAULT 'concluida': o Postgres preenche as prestações que já existem com
    --    'concluida' (histórico encerrado). NOT NULL + CHECK garantem que só os dois valores existem.
    alter table public.prestacao_pacientes
      add column status text not null default 'concluida'
      check (status in ('em_andamento', 'concluida'));

    -- 2) Só depois troca o DEFAULT para 'em_andamento' (valor das prestações NOVAS). Isso não reescreve
    --    nenhuma linha existente: o DEFAULT só vale para inserts futuros que não informam status.
    alter table public.prestacao_pacientes
      alter column status set default 'em_andamento';
  end if;
end
$$;
