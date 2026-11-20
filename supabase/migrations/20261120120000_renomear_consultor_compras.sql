-- JÁ APLICADA EM PRODUÇÃO EM 20/11/2026; NÃO REAPLICAR.
--
-- Renomear consultor: a função public.renomear_consultor passa a propagar o novo nome também para public.compras.vendedor (o vendedor da
-- Compra é o consultor gravado como TEXTO, igual a follow_up.consultor, prestacao_pacientes.consultor e dir.vendedor). A migration
-- 20261118231000_renomear_consultor.sql criou a função ANTES da tabela compras existir (20261119190000_compras.sql), então uma compra com
-- o nome antigo ficava com um vendedor que já não existe no Cadastro.
--
-- Este arquivo é o ESPELHO da função como está em produção: o corpo é o mesmo da versão anterior, mais o update de compras e a chave
-- `compras` no jsonb devolvido. Como `create or replace function` mantém os privilégios, o revoke/grant da migration anterior continua
-- valendo (só o service_role executa); por isso não se repetem aqui.
--
-- Mesmas regras de antes:
--   * p_nome_chave é a chave do novo nome (sem acento/caixa, espaços colapsados), calculada pelo app (shared/utils/cadastroNome.ts);
--   * se a chave já é de OUTRO consultor: erro 23505 (o app responde 409). Corrigir só acento/caixa (mesma chave do próprio consultor)
--     é permitido;
--   * consultor inexistente: erro P0002 (o app responde 404);
--   * nome igual ao atual: nada a propagar, devolve zeros.
-- Só são atualizadas as linhas cujo valor é IGUAL ao nome antigo exato, e o updated_at das tabelas propagadas NÃO é mexido (o de compras é
-- o token de versão do salvamento da compra: trocar o vendedor não deve se passar por uma edição feita por alguém).
-- Devolve jsonb { nomeAntigo, followUp, prestacao, dir, compras } com as linhas atualizadas em cada tabela.

create or replace function public.renomear_consultor(p_id text, p_nome_novo text, p_nome_chave text, p_por text)
returns jsonb
language plpgsql
set search_path to 'public'
as $fn$
declare
  v_antigo    text;
  v_follow_up integer := 0;
  v_prestacao integer := 0;
  v_dir       integer := 0;
  v_compras   integer := 0;
begin
  if p_nome_novo is null or btrim(p_nome_novo) = '' or p_nome_chave is null or p_nome_chave = '' then
    raise exception 'nome_invalido' using errcode = '22023';
  end if;

  -- Trava a linha do consultor até o fim da transação (duas renomeações juntas não se atropelam).
  select nome into v_antigo from public.cadastro_consultores where id = p_id for update;
  if not found then
    raise exception 'consultor_nao_encontrado' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.cadastro_consultores where nome_chave = p_nome_chave and id <> p_id) then
    raise exception 'nome_repetido' using errcode = '23505';
  end if;

  if v_antigo = p_nome_novo then
    return jsonb_build_object('nomeAntigo', v_antigo, 'followUp', 0, 'prestacao', 0, 'dir', 0, 'compras', 0);
  end if;

  update public.cadastro_consultores
     set nome = p_nome_novo,
         nome_chave = p_nome_chave,
         updated_at = now(),
         atualizado_por = p_por
   where id = p_id;

  update public.follow_up set consultor = p_nome_novo where consultor = v_antigo;
  get diagnostics v_follow_up = row_count;

  update public.prestacao_pacientes set consultor = p_nome_novo where consultor = v_antigo;
  get diagnostics v_prestacao = row_count;

  update public.dir set vendedor = p_nome_novo where vendedor = v_antigo;
  get diagnostics v_dir = row_count;

  update public.compras set vendedor = p_nome_novo where vendedor = v_antigo;
  get diagnostics v_compras = row_count;

  return jsonb_build_object('nomeAntigo', v_antigo, 'followUp', v_follow_up, 'prestacao', v_prestacao, 'dir', v_dir, 'compras', v_compras);
end;
$fn$;
