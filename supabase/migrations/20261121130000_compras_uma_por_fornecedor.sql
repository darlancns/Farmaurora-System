-- JÁ APLICADA EM PRODUÇÃO EM 21/11/2026; NÃO REAPLICAR.
--
-- Compras: uma compra por fornecedor (redesenho C1). A compra deixa de ter várias ORDENS: o fornecedor, o envio, a cia aérea, o frete e o
-- frete real passam a ser da própria compra; "Ordens" vira só um número (numero_ordens); os medicamentos são filhos diretos da compra.
-- A tabela compra_ordens deixa de existir. O PO sai da compra (a migração da DIR vai gerá-lo a partir da sequência da compra: não é feito aqui).
--
-- Este arquivo é o ESPELHO do que foi aplicado em produção (o Supabase roda cada migration numa transação, por isso não há begin/commit aqui).
-- Para criar o mesmo schema num banco novo (ex.: o Supabase local dos testes e2e) basta rodar TODAS as migrations em ordem: esta vem
-- DEPOIS de 20261119190000_compras.sql e de 20261120120000_renomear_consultor_compras.sql.
--
-- NÃO tem bloco de conversão de dados: quando foi aplicada, compras, compra_itens, compra_ordens e pre_cadastro_medicamentos estavam VAZIAS.
-- A guarda abaixo garante isso: se alguma tiver linha, a migration para antes de mexer em qualquer coisa (nada seria convertido).
--
-- O que muda:
--   * compras: vendedor vira consultor; entram fornecedor, envio, cia, frete, frete_real, empresa (FARMAURORA ou MAINZFARMA) e
--     numero_ordens (>= 1); saem isencao_para, local_declarado e courier_simples (o Courier Simples passa a ser derivado do envio);
--   * compra_itens: passa a apontar para a compra (compra_id, com cascata, posição única por compra e índice); referencia vira brand;
--     saem apresentacao (o nome do medicamento já leva a apresentação) e ordem_id (o que derruba junto os constraints e índices que dependiam
--     dela);
--   * compra_ordens é apagada;
--   * public.renomear_consultor: a mesma função de 20261120120000, trocando SÓ a linha que atualizava compras.vendedor por compras.consultor.
--
-- Privilégios: nenhum muda (grant é da tabela; o service_role continua com select, insert e update em compras e com delete também em
-- compra_itens). O RLS continua ligado e sem policies.

do $guarda$
begin
  if exists (select 1 from public.compras)
     or exists (select 1 from public.compra_itens)
     or exists (select 1 from public.compra_ordens)
     or exists (select 1 from public.pre_cadastro_medicamentos) then
    raise exception 'compras_uma_por_fornecedor: as tabelas de compras precisam estar vazias (esta migration não converte dados)';
  end if;
end
$guarda$;

-- compras
alter table public.compras rename column vendedor to consultor;

alter table public.compras
  add column fornecedor     text           not null default '',
  add column envio          text           not null default '',
  add column cia            text           not null default '',
  add column frete          numeric(14, 2),
  add column frete_real     numeric(14, 2),
  add column empresa        text           not null default 'FARMAURORA',
  add column numero_ordens  integer        not null default 1;

alter table public.compras
  add constraint compras_empresa_check       check (empresa in ('FARMAURORA', 'MAINZFARMA')),
  add constraint compras_numero_ordens_check check (numero_ordens >= 1),
  add constraint compras_frete_check         check (frete is null or frete >= 0),
  add constraint compras_frete_real_check    check (frete_real is null or frete_real >= 0);

alter table public.compras
  drop column isencao_para,
  drop column local_declarado,
  drop column courier_simples;

-- compra_itens: de filho da ordem para filho da compra
alter table public.compra_itens add column compra_id text not null;

alter table public.compra_itens
  add constraint compra_itens_compra_id_fkey   foreign key (compra_id) references public.compras (id) on delete cascade,
  add constraint compra_itens_compra_posicao_uq unique (compra_id, posicao) deferrable initially deferred;

create index compra_itens_compra_idx on public.compra_itens (compra_id);

alter table public.compra_itens rename column referencia to brand;

alter table public.compra_itens
  drop column apresentacao,
  drop column ordem_id;

-- as ordens deixam de existir
drop table public.compra_ordens;

-- renomear_consultor: igual à de 20261120120000_renomear_consultor_compras.sql, só com compras.consultor no lugar de compras.vendedor.
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

  update public.compras set consultor = p_nome_novo where consultor = v_antigo;
  get diagnostics v_compras = row_count;

  return jsonb_build_object('nomeAntigo', v_antigo, 'followUp', v_follow_up, 'prestacao', v_prestacao, 'dir', v_dir, 'compras', v_compras);
end;
$fn$;

notify pgrst, 'reload schema';
