-- Cadastros: lista nova de TRANSPORTADORAS e chave PIX nos despachantes e nas transportadoras.
--
-- JÁ APLICADA MANUALMENTE EM PRODUÇÃO EM 18/11/2026; NÃO REAPLICAR.
--
-- O que muda:
--   * public.cadastro_transportadoras é uma TABELA NOVA, no mesmo desenho de public.cadastro_cias_aereas (ver
--     20261109200000_cadastros.sql): id, nome, nome_chave (índice único, ativos E inativos), ativo, atualizado_por,
--     created_at e updated_at, mais chave_pix;
--   * public.cadastro_despachantes ganha a coluna chave_pix (nullable; as linhas existentes ficam com NULL).
--
-- DADO FINANCEIRO: a chave_pix é um dado financeiro. A API só pode devolvê-la a quem lê a seção Pagamentos e ao
-- administrador; nenhuma outra tela ou resposta (inclusive as listas de Cadastros lidas por todos os cargos) deve
-- trazê-la. Esse controle é do código do servidor; o banco só garante o formato (CHECK abaixo) e que ninguém
-- além do service_role chega às tabelas.
--
-- CHECK da chave_pix, nas DUAS tabelas: nula OU (não vazia depois do btrim e com no máximo 140 caracteres). O CHECK é
-- escrito com "is null or (is not null and ...)" de propósito: um CHECK que resulta em NULL conta como APROVADO (foi o
-- que nos pegou no prazo do fornecedor, onde "NULL between 1 and 365" dá NULL). Assim o NULL passa só pela 1ª condição,
-- de forma explícita, e qualquer valor preenchido é obrigado a passar na 2ª: "" e "   " são recusados, e 141+
-- caracteres também.
--
-- ADITIVA e IDEMPOTENTE: só cria tabela, índice, coluna e constraints novos (if not exists / checagem no catálogo);
-- não altera nem remove nada que já existe e pode rodar de novo sem efeito colateral.
--
-- Acesso: igual às outras listas de Cadastros — o app fala com a tabela SEMPRE pelo servidor, com a service role. RLS
-- ligado e SEM policies; sem permissão de exclusão (desativar é um update).
--
-- Desfazer (só depois de reverter o código que lê/grava estas colunas; perde o que foi cadastrado e as chaves PIX):
--   drop table if exists public.cadastro_transportadoras;
--   alter table public.cadastro_despachantes drop column if exists chave_pix;  -- leva junto o CHECK da coluna

create table if not exists public.cadastro_transportadoras (
  id             text        primary key,
  nome           text        not null,
  nome_chave     text        not null,
  chave_pix      text,
  ativo          boolean     not null default true,
  atualizado_por text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint cadastro_transportadoras_nome_valido check (btrim(nome) <> '' and nome_chave <> '')
);

create unique index if not exists cadastro_transportadoras_nome_chave_uq on public.cadastro_transportadoras (nome_chave);

alter table public.cadastro_despachantes add column if not exists chave_pix text;

-- CHECK da chave_pix (despachantes e transportadoras). `alter table ... add constraint` não tem "if not exists",
-- então cada uma só é criada se ainda não existir (idempotente). Nas linhas atuais a coluna é NULL, então a
-- validação ao criar a constraint passa.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cadastro_despachantes'::regclass
      and conname = 'cadastro_despachantes_chave_pix_valida'
  ) then
    alter table public.cadastro_despachantes
      add constraint cadastro_despachantes_chave_pix_valida check (
        chave_pix is null
        or (chave_pix is not null and btrim(chave_pix) <> '' and length(chave_pix) <= 140)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cadastro_transportadoras'::regclass
      and conname = 'cadastro_transportadoras_chave_pix_valida'
  ) then
    alter table public.cadastro_transportadoras
      add constraint cadastro_transportadoras_chave_pix_valida check (
        chave_pix is null
        or (chave_pix is not null and btrim(chave_pix) <> '' and length(chave_pix) <= 140)
      );
  end if;
end
$$;

-- RLS ligado e sem policies; só o cliente admin do servidor (service role) acessa.
alter table public.cadastro_transportadoras enable row level security;

-- Privilégios (mesmo padrão de 20261109200000_cadastros.sql): o Supabase concede tudo ao service_role em tabelas novas
-- do schema public, então primeiro se tira tudo e depois se concede só ler, criar e alterar. Sem delete: desativar é
-- um update. A tabela de despachantes já tem os privilégios dela; adicionar uma coluna não os altera.
revoke all on table public.cadastro_transportadoras from public, anon, authenticated, service_role;

grant select, insert, update on table public.cadastro_transportadoras to service_role;
