-- Função TEMPORÁRIA da recarga definitiva do Follow-Up (fonte de 2026-11-05).
-- Criar → chamar UMA vez → DROP. NÃO executada na etapa 1 (backup + dry-run).
-- O arquivo com os DADOS (payload) é gerado por scripts/migration/gerar-carga-follow-up-2026-11.mjs em
-- scripts/migration/backups/ (ignorado pelo git: contém dados de pacientes) e inclui esta função.
--
-- Tudo numa ÚNICA transação (a função é atômica: qualquer exceção desfaz o delete e o insert):
--   1. valida o payload (array, contagem, nenhuma pasta demo, ids únicos);
--   2. trava de concorrência: contagem total e max(updated_at) iguais aos do backup — se alguém editou
--      o Follow-Up depois do backup, aborta ANTES de apagar;
--   3. confere que os 4 processos demo (pastas 2026 - 901..904) existem e NÃO os toca;
--   4. apaga todos os processos reais (exceto demo e os ids em p_preservar) e confere a contagem;
--   5. insere o payload (jsonb_populate_recordset: por NOME de coluna; o payload traz TODAS as colunas,
--      inclusive alerta_fornecedor_resolvido e alerta_mandado_resolvido já com as marcas preservadas);
--   6. confere inseridos e contagem final (= demo + preservados + novos).
--
-- Segurança: EXECUTE só para service_role (revogado de public/anon/authenticated). Não há outras
-- tabelas com FK para follow_up (a única constraint da tabela é a chave primária).

create or replace function public.carga_follow_up_2026_11(
  p_rows jsonb,
  p_esperado_atual integer,
  p_max_updated_at timestamptz,
  p_esperado_apagar integer,
  p_esperado_novo integer,
  p_preservar text[] default '{}'
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  c_demo constant text[] := array['2026 - 901', '2026 - 902', '2026 - 903', '2026 - 904'];
  v_total integer;
  v_max timestamptz;
  v_demo integer;
  v_apagados integer;
  v_inseridos integer;
  v_final integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'carga_follow_up_2026_11: p_rows deve ser um array JSON';
  end if;
  if jsonb_array_length(p_rows) <> p_esperado_novo then
    raise exception 'carga_follow_up_2026_11: % registros recebidos, esperado %', jsonb_array_length(p_rows), p_esperado_novo;
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r where (r ->> 'pasta') = any (c_demo)) then
    raise exception 'carga_follow_up_2026_11: o payload contém pasta demo (901–904)';
  end if;
  if (select count(distinct r ->> 'id') from jsonb_array_elements(p_rows) r) <> p_esperado_novo then
    raise exception 'carga_follow_up_2026_11: ids duplicados no payload';
  end if;

  select count(*), max(updated_at), count(*) filter (where pasta = any (c_demo))
    into v_total, v_max, v_demo
    from public.follow_up;
  if v_total <> p_esperado_atual then
    raise exception 'carga_follow_up_2026_11: tabela tem % registros, esperado % (backup desatualizado)', v_total, p_esperado_atual;
  end if;
  if v_max is distinct from p_max_updated_at then
    raise exception 'carga_follow_up_2026_11: max(updated_at)=% difere do backup (%): houve edição', v_max, p_max_updated_at;
  end if;
  if v_demo <> 4 then
    raise exception 'carga_follow_up_2026_11: esperava os 4 processos demo (901–904), achei %', v_demo;
  end if;

  delete from public.follow_up
   where not (pasta = any (c_demo))
     and not (id = any (p_preservar));
  get diagnostics v_apagados = row_count;
  if v_apagados <> p_esperado_apagar then
    raise exception 'carga_follow_up_2026_11: apagaria % registros, esperado % — rollback', v_apagados, p_esperado_apagar;
  end if;

  insert into public.follow_up
  select * from jsonb_populate_recordset(null::public.follow_up, p_rows);
  get diagnostics v_inseridos = row_count;
  if v_inseridos <> p_esperado_novo then
    raise exception 'carga_follow_up_2026_11: inseridos % (esperado %) — rollback', v_inseridos, p_esperado_novo;
  end if;

  select count(*) into v_final from public.follow_up;
  if v_final <> 4 + coalesce(array_length(p_preservar, 1), 0) + p_esperado_novo then
    raise exception 'carga_follow_up_2026_11: contagem final % inesperada — rollback', v_final;
  end if;
  if (select count(*) from public.follow_up where pasta = any (c_demo)) <> 4 then
    raise exception 'carga_follow_up_2026_11: os processos demo foram afetados — rollback';
  end if;

  return jsonb_build_object('apagados', v_apagados, 'inseridos', v_inseridos, 'demo_preservados', v_demo, 'total_final', v_final);
end
$fn$;

revoke all on function public.carga_follow_up_2026_11(jsonb, integer, timestamptz, integer, integer, text[]) from public;
revoke all on function public.carga_follow_up_2026_11(jsonb, integer, timestamptz, integer, integer, text[]) from anon;
revoke all on function public.carga_follow_up_2026_11(jsonb, integer, timestamptz, integer, integer, text[]) from authenticated;
grant execute on function public.carga_follow_up_2026_11(jsonb, integer, timestamptz, integer, integer, text[]) to service_role;

-- Depois da carga:
-- drop function public.carga_follow_up_2026_11(jsonb, integer, timestamptz, integer, integer, text[]);
