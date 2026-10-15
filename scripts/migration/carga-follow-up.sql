-- Função TEMPORÁRIA da recarga do Follow-Up (apaga + insere numa ÚNICA transação).
-- Criar → rodar a carga (service role) → DROP. Ver scripts/migration/ (carga única).
--
-- Segurança:
--   * EXECUTE só para service_role (revogado de public, anon e authenticated).
--   * Trava de contagem e de max(updated_at): se alguém editou o Follow-Up depois do
--     backup, a função levanta exceção ANTES de apagar (nada muda).
--   * Qualquer falha no meio (insert, contagem) aborta a função inteira → rollback:
--     nada é apagado.
--
-- Entrada: p_rows = array JSON com TODAS as colunas de follow_up (jsonb_populate_recordset
-- não aplica defaults: coluna ausente vira NULL, então o script de carga manda todas).

create or replace function public.carga_follow_up(
  p_rows jsonb,
  p_esperado_atual integer,
  p_max_updated_at timestamptz,
  p_esperado_novo integer
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_atual integer;
  v_max timestamptz;
  v_novo integer;
  v_inseridos integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'carga_follow_up: p_rows deve ser um array JSON';
  end if;

  v_novo := jsonb_array_length(p_rows);
  if v_novo <> p_esperado_novo then
    raise exception 'carga_follow_up: % registros recebidos, esperado %', v_novo, p_esperado_novo;
  end if;

  select count(*), max(updated_at) into v_atual, v_max from public.follow_up;
  if v_atual <> p_esperado_atual then
    raise exception 'carga_follow_up: tabela tem % registros, esperado % (backup desatualizado)', v_atual, p_esperado_atual;
  end if;
  if v_max is distinct from p_max_updated_at then
    raise exception 'carga_follow_up: max(updated_at)=% difere do backup (%): houve edição', v_max, p_max_updated_at;
  end if;

  delete from public.follow_up where true;

  insert into public.follow_up
  select * from jsonb_populate_recordset(null::public.follow_up, p_rows);
  get diagnostics v_inseridos = row_count;

  if v_inseridos <> p_esperado_novo then
    raise exception 'carga_follow_up: inseridos % (esperado %) — rollback', v_inseridos, p_esperado_novo;
  end if;

  return jsonb_build_object('apagados', v_atual, 'inseridos', v_inseridos);
end
$fn$;

revoke all on function public.carga_follow_up(jsonb, integer, timestamptz, integer) from public;
revoke all on function public.carga_follow_up(jsonb, integer, timestamptz, integer) from anon;
revoke all on function public.carga_follow_up(jsonb, integer, timestamptz, integer) from authenticated;
grant execute on function public.carga_follow_up(jsonb, integer, timestamptz, integer) to service_role;

-- Depois da carga:
-- drop function public.carga_follow_up(jsonb, integer, timestamptz, integer);
