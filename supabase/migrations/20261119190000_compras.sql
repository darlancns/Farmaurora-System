-- JÁ APLICADA EM PRODUÇÃO EM 19/11/2026; NÃO REAPLICAR.
-- recorrente adicionada em 19/11/2026 por ALTER separado; este arquivo mostra o estado final.
--
-- Compras: as quatro tabelas da página Compras (compras, compra_ordens, compra_itens e pre_cadastro_medicamentos).
--
-- Este arquivo existe só para o repositório espelhar o que já está no banco. Para criar o mesmo schema num banco novo (ex.: o Supabase
-- local dos testes e2e), basta rodar este arquivo DEPOIS de 20261119160000_cadastro_temperaturas_medicamentos.sql (as chaves
-- estrangeiras apontam para public.cadastro_medicamentos).
--
-- ADITIVA e IDEMPOTENTE: só cria tabelas e índices (create ... if not exists); não altera nem remove nada que já existe.
--
-- Desenho:
--   * compras: uma compra por linha, numerada por mês de BRASÍLIA ((ano_mes, sequencia) é único: o app calcula "maior + 1" e tenta de
--     novo se der 23505). Colunas planas e tipadas; textos vazios são '' (não NULL); pagamento_alvara, pagamento_momento e documentos
--     são NULL quando a pessoa ainda não decidiu. NÃO existe exclusão: cancelar é cancelada = true (o service_role nem tem DELETE);
--   * compra_ordens e compra_itens: as ordens da compra e os medicamentos de cada ordem. As filhas PODEM ser apagadas (o salvamento
--     da compra sincroniza o estado completo: o que saiu da tela sai do banco) e são apagadas em cascata com a compra/ordem. A posição
--     é única por pai, mas a constraint é DEFERRABLE INITIALLY DEFERRED para trocar duas posições num mesmo comando sem violá-la;
--   * pre_cadastro_medicamentos: medicamento que ainda não está no Cadastro, pedido a partir de uma compra. Só um pendente por nome
--     (índice único parcial em nome_chave onde status = 'pendente'); a aprovação é do administrador, em outra etapa;
--   * numéricos de dinheiro são numeric(14,2) e NULL quando vazios (o Postgres os devolve como TEXTO: o app converte);
--   * RLS ligado SEM policies: anon e authenticated não leem nem escrevem nada direto; o app fala com as tabelas só pelo servidor,
--     com a service role.

create table if not exists public.compras (
  id                text        primary key,
  ano_mes           text        not null,
  sequencia         integer     not null,
  cancelada         boolean     not null default false,
  paciente          text        not null default '',
  processo_numero   text        not null default '',
  medico            text        not null default '',
  local_aplicacao   text        not null default '',
  entrega           text        not null default '',
  contatos          text        not null default '',
  termo_observacao  text        not null default '',
  despachante       text        not null default '',
  isencao_para      text        not null default '',
  observacoes       text        not null default '',
  vendedor          text        not null default '',
  responsavel       text        not null default '',
  compra_particular boolean     not null default false,
  local_declarado   boolean     not null default false,
  termo_posterior   boolean     not null default false,
  courier_simples   boolean     not null default false,
  isencao           boolean     not null default false,
  recorrente        boolean     not null default false,
  pagamento_alvara  boolean,
  pagamento_momento text,
  documentos        boolean,
  pendencias        text[]      default '{}',
  criado_por        text,
  atualizado_por    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint compras_sequencia_valida check (sequencia >= 1),
  constraint compras_pagamento_momento_valido check (pagamento_momento is null or pagamento_momento in ('vamos_pagar', 'apos_awb')),
  constraint compras_mes_sequencia_uq unique (ano_mes, sequencia)
);

create table if not exists public.pre_cadastro_medicamentos (
  id             text        primary key,
  nome           text        not null,
  nome_chave     text        not null,
  temperatura    text        not null default '',
  status         text        not null default 'pendente',
  compra_id      text        references public.compras (id),
  cadastro_id    text        references public.cadastro_medicamentos (id),
  solicitado_por text,
  decidido_por   text,
  decidido_em    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint pre_cadastro_medicamentos_status_valido check (status in ('pendente', 'aprovado', 'rejeitado'))
);

create unique index if not exists pre_cadastro_medicamentos_pendente_uq
  on public.pre_cadastro_medicamentos (nome_chave)
  where status = 'pendente';

create table if not exists public.compra_ordens (
  id            text        primary key,
  compra_id     text        not null references public.compras (id) on delete cascade,
  posicao       integer     not null,
  fornecedor    text        not null default '',
  envio         text        not null default '',
  cia           text        not null default '',
  po            text        not null default '',
  frete         numeric(14, 2),
  frete_real    numeric(14, 2),
  dir_id        text,
  encaminhada_em timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint compra_ordens_posicao_valida check (posicao >= 1),
  constraint compra_ordens_po_valido check (po = '' or po ~ '^PO[0-9]{2}-[0-9]{2}-[0-9]{4}$'),
  constraint compra_ordens_frete_valido check (frete is null or frete >= 0),
  constraint compra_ordens_frete_real_valido check (frete_real is null or frete_real >= 0),
  constraint compra_ordens_compra_posicao_uq unique (compra_id, posicao) deferrable initially deferred
);

create table if not exists public.compra_itens (
  id                     text        primary key,
  ordem_id               text        not null references public.compra_ordens (id) on delete cascade,
  posicao                integer     not null,
  medicamento            text        not null,
  medicamento_cadastro_id text       references public.cadastro_medicamentos (id),
  pre_cadastro_id        text        references public.pre_cadastro_medicamentos (id),
  apresentacao           text        not null default '',
  referencia             text        not null default '',
  laboratorio            text        not null default '',
  quantidade             text        not null default '',
  temperatura            text        not null default '',
  valor_unitario         numeric(14, 2),
  valor_real             numeric(14, 2),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint compra_itens_posicao_valida check (posicao >= 1),
  constraint compra_itens_valor_unitario_valido check (valor_unitario is null or valor_unitario >= 0),
  constraint compra_itens_valor_real_valido check (valor_real is null or valor_real >= 0),
  constraint compra_itens_ordem_posicao_uq unique (ordem_id, posicao) deferrable initially deferred
);

alter table public.compras enable row level security;
alter table public.pre_cadastro_medicamentos enable row level security;
alter table public.compra_ordens enable row level security;
alter table public.compra_itens enable row level security;

-- Privilégios: primeiro se tira tudo e depois se concede só o necessário.
revoke all on table public.compras from public, anon, authenticated, service_role;
revoke all on table public.pre_cadastro_medicamentos from public, anon, authenticated, service_role;
revoke all on table public.compra_ordens from public, anon, authenticated, service_role;
revoke all on table public.compra_itens from public, anon, authenticated, service_role;

-- compras e o pré-cadastro: sem exclusão (cancelar é um update; o pré-cadastro é aprovado ou rejeitado por update).
grant select, insert, update on table public.compras to service_role;
grant select, insert, update on table public.pre_cadastro_medicamentos to service_role;
-- as filhas: com exclusão (o salvamento sincroniza o estado completo da compra).
grant select, insert, update, delete on table public.compra_ordens to service_role;
grant select, insert, update, delete on table public.compra_itens to service_role;
