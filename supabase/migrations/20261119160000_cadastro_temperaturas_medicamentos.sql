-- JÁ APLICADA EM PRODUÇÃO EM 19/11/2026; NÃO REAPLICAR.
--
-- Cadastros — sexta e sétima listas: temperaturas e medicamentos (Configurações → Cadastros), base da futura página de Compras.
--
-- Este arquivo existe só para o repositório espelhar o que já está no banco. A carga dos dados (6 temperaturas e 414 medicamentos)
-- também já foi feita em produção e NÃO está aqui. Para criar o mesmo schema num banco novo (ex.: o Supabase local dos testes e2e),
-- basta rodar este arquivo; depois é preciso cadastrar as temperaturas e os medicamentos pela tela.
--
-- ADITIVA e IDEMPOTENTE: só cria tabelas e índices (create ... if not exists); não altera nem remove nada que já existe.
--
-- Mesmo padrão de `cadastro_cias_aereas` e `cadastro_consultores` (20261109200000_cadastros.sql, 20261118210000_cadastro_consultores.sql):
--   * `nome_chave` é o nome sem acento, sem diferença de caixa e com espaços colapsados (shared/utils/cadastroNome.ts). O índice único
--     nela vale para ativos E inativos: nome repetido (ou só com outra grafia) é recusado;
--   * "remover" é só desativar (`ativo = false`): não existe rota de exclusão e o service_role nem tem permissão de exclusão;
--   * RLS ligado e SEM policies: o app só fala com as tabelas pelo servidor, com a service role.
--
-- Diferenças:
--   * temperaturas: o NOME não muda depois de criado (o medicamento guarda uma CÓPIA do texto da temperatura);
--   * medicamentos: o nome é gravado em MAIÚSCULAS pelo servidor e pode ser renomeado (um UPDATE só; nada é propagado). A coluna
--     `temperatura` é texto e cópia do nome de uma temperatura ATIVA (o servidor valida; não há chave estrangeira de propósito).

create table if not exists public.cadastro_temperaturas (
  id             text        primary key,
  nome           text        not null,
  nome_chave     text        not null,
  ativo          boolean     not null default true,
  atualizado_por text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint cadastro_temperaturas_nome_valido check (btrim(nome) <> '' and nome_chave <> '')
);

create unique index if not exists cadastro_temperaturas_nome_chave_uq on public.cadastro_temperaturas (nome_chave);

create table if not exists public.cadastro_medicamentos (
  id             text        primary key,
  nome           text        not null,
  nome_chave     text        not null,
  temperatura    text        not null,
  ativo          boolean     not null default true,
  atualizado_por text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint cadastro_medicamentos_nome_valido check (btrim(nome) <> '' and nome_chave <> '' and btrim(temperatura) <> '')
);

create unique index if not exists cadastro_medicamentos_nome_chave_uq on public.cadastro_medicamentos (nome_chave);

alter table public.cadastro_temperaturas enable row level security;
alter table public.cadastro_medicamentos enable row level security;

-- Privilégios: primeiro se tira tudo e depois se concede só ler, criar e alterar (desativar é um update).
revoke all on table public.cadastro_temperaturas from public, anon, authenticated, service_role;
revoke all on table public.cadastro_medicamentos from public, anon, authenticated, service_role;

grant select, insert, update on table public.cadastro_temperaturas to service_role;
grant select, insert, update on table public.cadastro_medicamentos to service_role;
