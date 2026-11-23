-- JÁ APLICADA em produção em 18/11/2026 (versão 20261118212456). Não executar manualmente.
-- A primeira atualização do backfill só atua onde status_desde é nulo (idempotente).
--
-- Follow-Up: `status_desde` = o instante em que o processo entrou na coluna (status normalizado) em que está agora.
-- Base da ordem do Kanban (mais antigo em cima; em Entregue, o mais novo em cima).
--  - coluna follow_up.status_desde timestamptz (nula no início; o backfill abaixo preenche todas as linhas);
--  - follow_up_status_coluna(text): o status NORMALIZADO (aguardando_inicio = elaboracao_fornecedores;
--    liberado_parcial e outro = desembaraco), a mesma regra de normalizarStatusProcesso (shared/constants/processos.ts);
--  - gatilho follow_up_status_desde (BEFORE INSERT OR UPDATE): no INSERT, status_desde = coalesce(status_desde,
--    created_at, now()); no UPDATE, now() quando o status NORMALIZADO muda. NÃO mexe em updated_at (a `versao` do conflito
--    de edição continua sendo só o updated_at). O código da aplicação NÃO grava status_desde em caminho nenhum.

alter table public.follow_up add column if not exists status_desde timestamptz;

create or replace function public.follow_up_status_coluna(s text) returns text
language sql immutable set search_path = public as $f$
  select case s when 'aguardando_inicio' then 'elaboracao_fornecedores'
                when 'liberado_parcial'  then 'desembaraco'
                when 'outro'             then 'desembaraco'
                else s end
$f$;

create or replace function public.follow_up_marcar_status_desde() returns trigger
language plpgsql set search_path = public as $f$
begin
  if tg_op = 'INSERT' then
    new.status_desde := coalesce(new.status_desde, new.created_at, now());
  elsif public.follow_up_status_coluna(new.status::text)
        is distinct from public.follow_up_status_coluna(old.status::text) then
    new.status_desde := now();
  end if;
  return new;
end
$f$;

-- 1) data do texto da última movimentação, se bater com a coluna atual
with ult as (
  select f.id, f.status,
    (select a->>'texto'
       from jsonb_array_elements(coalesce(f.atualizacoes,'[]'::jsonb)) with ordinality as t(a, ord)
      where a->>'texto' ~ '^(Status alterado de .+ para .+|Chegada confirmada) em [0-9]{2}/[0-9]{2}\.$'
      order by ord desc limit 1) as texto
  from public.follow_up f
  where f.status_desde is null
), p as (
  select id, texto,
    substring(texto from '^Status alterado de .+ para (.+) em [0-9]{2}/[0-9]{2}\.$') as para,
    substring(texto from ' em ([0-9]{2})/[0-9]{2}\.$')::int as dd,
    substring(texto from ' em [0-9]{2}/([0-9]{2})\.$')::int as mm,
    public.follow_up_status_coluna(status::text) as col
  from ult where texto is not null
), ok as (
  select id, dd, mm from p
  where mm between 1 and 12 and dd between 1 and 31
    and ( (texto like 'Chegada confirmada%' and col = 'desembaraco')
       or para = case col when 'elaboracao_fornecedores' then 'Na origem'
                          when 'em_transito' then 'Em trânsito'
                          when 'desembaraco' then 'Desembaraço'
                          when 'liberado'    then 'Liberado'
                          when 'entregue'    then 'Entregue' end )
), com_ano as (
  select id, dd, mm,
    case when make_date(extract(year from (now() at time zone 'America/Sao_Paulo'))::int, mm, dd)
              > (now() at time zone 'America/Sao_Paulo')::date
         then extract(year from (now() at time zone 'America/Sao_Paulo'))::int - 1
         else extract(year from (now() at time zone 'America/Sao_Paulo'))::int end as ano
  from ok
)
update public.follow_up f
   set status_desde = ((make_date(c.ano, c.mm, c.dd)::timestamp + time '12:00') at time zone 'America/Sao_Paulo')
  from com_ano c where f.id = c.id and f.status_desde is null;

-- 2) existe texto de movimentação, mas não bate com a coluna atual: mudou depois, sem texto -> última edição
update public.follow_up f set status_desde = f.updated_at
 where f.status_desde is null
   and exists (select 1 from jsonb_array_elements(coalesce(f.atualizacoes,'[]'::jsonb)) a
                where a->>'texto' ~ '^(Status alterado de .+ para .+|Chegada confirmada) em [0-9]{2}/[0-9]{2}\.$');

-- 3) o resto: data de criação
update public.follow_up set status_desde = created_at where status_desde is null;

drop trigger if exists follow_up_status_desde on public.follow_up;
create trigger follow_up_status_desde
before insert or update on public.follow_up
for each row execute function public.follow_up_marcar_status_desde();
