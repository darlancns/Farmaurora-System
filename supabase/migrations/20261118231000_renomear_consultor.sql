-- JÁ APLICADA EM PRODUÇÃO EM 18/11/2026; NÃO REAPLICAR.
--
-- Renomear consultor (Configurações → Cadastros → Consultores): função que muda o NOME do consultor e propaga o texto, tudo NUMA
-- transação do banco. O consultor é gravado como TEXTO no Cadastro e em três tabelas, e tudo precisa mudar junto:
--   * public.cadastro_consultores  (nome, nome_chave, updated_at, atualizado_por)
--   * public.follow_up.consultor
--   * public.prestacao_pacientes.consultor
--   * public.dir.vendedor
-- (As três últimas são colunas já convertidas de enum para texto em produção, em 18/11/2026; o enum consultor_nome continua
-- existindo e NÃO é tocado aqui.) Só são atualizadas as linhas cujo valor é IGUAL ao nome antigo exato. As contas de login
-- (app_metadata.consultorNome) NÃO ficam no banco: o app as atualiza depois, pela API admin do Auth, de forma idempotente.
--
-- Não mexe em updated_at das tabelas de processo/DIR/prestação: só no valor do consultor (o updated_at do follow_up é o token de
-- versão da edição; trocar o consultor não deve se passar por uma edição feita por alguém).
--
-- Regras:
--   * p_nome_chave é a chave do novo nome (sem acento/caixa, espaços colapsados), calculada pelo app (shared/utils/cadastroNome.ts);
--   * se a chave já é de OUTRO consultor: erro 23505 (o app responde 409). Corrigir só acento/caixa (mesma chave do próprio
--     consultor) é permitido;
--   * consultor inexistente: erro P0002 (o app responde 404);
--   * nome igual ao atual: nada a propagar, devolve zeros.
-- A função só roda pelo servidor (service role): revoke all de public/anon/authenticated e grant execute só ao service_role.
-- Devolve jsonb { nomeAntigo, followUp, prestacao, dir } com as linhas atualizadas em cada tabela.

create or replace function public.renomear_consultor(
  p_id         text,
  p_nome_novo  text,
  p_nome_chave text,
  p_por        text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_antigo    text;
  v_follow_up integer := 0;
  v_prestacao integer := 0;
  v_dir       integer := 0;
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
    return jsonb_build_object('nomeAntigo', v_antigo, 'followUp', 0, 'prestacao', 0, 'dir', 0);
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

  return jsonb_build_object('nomeAntigo', v_antigo, 'followUp', v_follow_up, 'prestacao', v_prestacao, 'dir', v_dir);
end;
$$;

revoke all on function public.renomear_consultor(text, text, text, text) from public, anon, authenticated;
grant execute on function public.renomear_consultor(text, text, text, text) to service_role;
