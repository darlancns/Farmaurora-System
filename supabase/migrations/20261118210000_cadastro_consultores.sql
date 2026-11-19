-- JÁ APLICADA MANUALMENTE EM PRODUÇÃO EM 18/11/2026; NÃO REAPLICAR.
--
-- Cadastros — quinta lista: consultores (Configurações → Cadastros). Etapa 1: a lista vale SÓ para a DIR (o campo
-- Consultor/vendedor do formulário da DIR lê os ativos desta tabela). Follow-Up, Prestação e as contas de login continuam
-- com a lista antiga (enum `consultor_nome` e constantes do código); NADA do enum é alterado aqui.
--
-- Este arquivo existe só para o repositório espelhar o que já está no banco. A carga dos 16 nomes (15 ativos e "Junior"
-- inativo) também já foi feita em produção e NÃO está aqui. Para criar o mesmo schema num banco novo (ex.: o Supabase local
-- dos testes e2e), basta rodar este arquivo; depois é preciso cadastrar os consultores pela tela.
--
-- ADITIVA e IDEMPOTENTE: só cria a tabela e o índice (create ... if not exists); não altera nem remove nada que já existe.
--
-- Mesmo padrão de `cadastro_cias_aereas` (20261109200000_cadastros.sql):
--   * `nome_chave` é o nome sem acento, sem diferença de caixa e com espaços colapsados (shared/utils/cadastroNome.ts). O
--     índice único nela vale para ativos E inativos: nome repetido (ou só com outra grafia) é recusado;
--   * "remover" é só desativar (`ativo = false`): não existe rota de exclusão e o service_role nem tem permissão de exclusão;
--   * o NOME não muda depois de criado (o valor do consultor é gravado como texto na DIR);
--   * RLS ligado e SEM policies: o app só fala com a tabela pelo servidor, com a service role.

create table if not exists public.cadastro_consultores (
  id             text        primary key,
  nome           text        not null,
  nome_chave     text        not null,
  ativo          boolean     not null default true,
  atualizado_por text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint cadastro_consultores_nome_valido check (btrim(nome) <> '' and nome_chave <> '')
);

create unique index if not exists cadastro_consultores_nome_chave_uq on public.cadastro_consultores (nome_chave);

alter table public.cadastro_consultores enable row level security;

-- Privilégios: primeiro se tira tudo e depois se concede só ler, criar e alterar (desativar é um update).
revoke all on table public.cadastro_consultores from public, anon, authenticated, service_role;

grant select, insert, update on table public.cadastro_consultores to service_role;
