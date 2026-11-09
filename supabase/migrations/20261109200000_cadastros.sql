-- Cadastros v1 (Configurações → Cadastros): três listas editáveis só pelo administrador — fornecedores, despachantes
-- (só EMPRESA) e temperaturas. Nesta etapa NENHUMA outra tela lê estas tabelas: entram só as tabelas e a tela de Cadastros.
--
-- ADITIVA e IDEMPOTENTE: só cria tabelas e índices novos (create ... if not exists); não altera nem remove nada que já
-- existe, e pode rodar de novo sem efeito colateral. NÃO APLICADA por quem escreveu este arquivo: aplicar à mão
-- (Supabase Dashboard → SQL Editor) ANTES do deploy do código. Sem as tabelas, só a aba Cadastros falha.
--
-- Desenho (ver shared/types/Cadastro.ts e server/utils/cadastroMappers.ts):
--   * colunas planas e tipadas, sem jsonb; uma tabela por lista, porque cada uma guarda coisas diferentes
--     (prazo e país só no fornecedor; contato só no despachante);
--   * `nome_chave` é o nome sem acento, sem diferença de caixa e com espaços colapsados (a mesma normalização de
--     chaveFornecedor, em shared/utils/dirParser.ts, reproduzida em shared/utils/cadastroNome.ts). O índice único
--     nela vale para ativos E inativos: nome repetido (ou só com outra grafia) é recusado;
--   * "remover" é só desativar (`ativo = false`): não existe rota de exclusão e o service_role nem tem permissão de
--     exclusão nestas tabelas (ver o fim do arquivo);
--   * "Outro" é o sentinela dos selects das telas, não um item da lista: o servidor recusa esse nome;
--   * fornecedor: o prazo do alerta é decidido de propósito — ou um número de dias (1 a 365) ou "sem alerta" marcado.
--     O CHECK abaixo impede salvar sem decidir (o "is not null" é necessário: um CHECK que dá NULL conta como aprovado,
--     e "NULL between 1 and 365" dá NULL). País é opcional.
--
-- Acesso: o app fala com estas tabelas SEMPRE pelo servidor, com a service role (RBAC em shared/utils/rbac.ts, seção
-- "config": todos os cargos leem, só o administrador escreve). RLS ligado e SEM policies: anon/authenticated não
-- leem nem escrevem nada direto.

create table if not exists public.cadastro_fornecedores (
  id                text        primary key,
  nome              text        not null,
  nome_chave        text        not null,
  pais              text,
  prazo_alerta_dias integer,
  sem_alerta        boolean     not null default false,
  ativo             boolean     not null default true,
  atualizado_por    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint cadastro_fornecedores_nome_valido check (btrim(nome) <> '' and nome_chave <> ''),
  constraint cadastro_fornecedores_alerta_decidido check (
    (sem_alerta and prazo_alerta_dias is null)
    or (not sem_alerta and prazo_alerta_dias is not null and prazo_alerta_dias between 1 and 365)
  )
);

create unique index if not exists cadastro_fornecedores_nome_chave_uq on public.cadastro_fornecedores (nome_chave);

create table if not exists public.cadastro_despachantes (
  id             text        primary key,
  nome           text        not null,
  nome_chave     text        not null,
  contato_nome   text,
  telefone       text,
  email          text,
  ativo          boolean     not null default true,
  atualizado_por text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint cadastro_despachantes_nome_valido check (btrim(nome) <> '' and nome_chave <> '')
);

create unique index if not exists cadastro_despachantes_nome_chave_uq on public.cadastro_despachantes (nome_chave);

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

-- RLS ligado e sem policies; só o cliente admin do servidor (service role) acessa.
alter table public.cadastro_fornecedores enable row level security;
alter table public.cadastro_despachantes enable row level security;
alter table public.cadastro_temperaturas enable row level security;

-- Privilégios: o Supabase concede tudo ao service_role em tabelas novas do schema public, então primeiro se tira tudo
-- e depois se concede só ler, criar e alterar. Assim nem um erro de código consegue apagar um item (desativar é um
-- update). Uma limpeza futura exigiria uma migration manual de propósito. Repetir estas linhas mantém o mesmo estado.
revoke all on table public.cadastro_fornecedores from public, anon, authenticated, service_role;
revoke all on table public.cadastro_despachantes from public, anon, authenticated, service_role;
revoke all on table public.cadastro_temperaturas from public, anon, authenticated, service_role;

grant select, insert, update on table public.cadastro_fornecedores to service_role;
grant select, insert, update on table public.cadastro_despachantes to service_role;
grant select, insert, update on table public.cadastro_temperaturas to service_role;
