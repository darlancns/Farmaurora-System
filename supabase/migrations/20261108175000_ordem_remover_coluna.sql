-- APLICADA à mão em produção em 08/11/2026 (~17:30), depois do deploy do código sem ordem, com backup, ensaio e trava.
--
-- REGISTRO HISTÓRICO: este arquivo documenta o que foi rodado; não precisa ser aplicado de novo. Se rodar (de novo
-- ou num banco novo), é seguro: sem a coluna "ordem" não faz nada.
--
-- Remove a coluna antiga public.follow_up.ordem (text, "Ordem N" ou NULL), congelada desde que o Nº Remessa
-- (numero_remessa, ver 20261108170000_follow_up_numero_remessa.sql) a substituiu. O código já não a lê nem a grava.
--
-- TRAVA: antes de apagar, confere que nenhuma linha com número em "ordem" (o primeiro grupo de dígitos de
-- "Ordem 2" -> 2) tem numero_remessa diferente desse número, ou seja, que a conversão para numero_remessa foi feita
-- e nada se perderia. Se houver divergência, aborta com RAISE EXCEPTION e não apaga nada. Linhas com "ordem"
-- NULL ou sem dígitos não têm número a comparar e não entram na trava.
--
-- A coluna é citada só dentro de EXECUTE: quando ela não existe o bloco nem a referencia (o PL/pgSQL não
-- chega a planejar a consulta), então não falha. Por isso não é "drop column if exists" sozinho: ele apagaria a
-- coluna SEM a trava.
--
-- Idempotente: se a coluna não existe, não faz nada.

do $$
declare
  v_divergentes bigint;
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'follow_up'
       and column_name = 'ordem'
  ) then
    execute $q$
      select count(*)
        from public.follow_up
       where substring(ordem from '[0-9]+') is not null
         and substring(ordem from '[0-9]+')::int <> numero_remessa
    $q$ into v_divergentes;

    if v_divergentes > 0 then
      raise exception
        'Trava: % linha(s) de follow_up com numero_remessa diferente do número em "ordem". Nada foi apagado.',
        v_divergentes;
    end if;

    execute 'alter table public.follow_up drop column ordem';
  end if;
end
$$;
