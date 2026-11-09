-- Tabela `dir` — página DIR (planilha "DIR 2º Semestre - 2026 - FARMAURORA", 1 linha por PO).
--
-- Aplicação MANUAL (revisar antes): Supabase Dashboard → SQL Editor → colar e rodar.
-- É idempotente (pode rodar de novo sem efeito colateral). NÃO foi aplicada pelo agente.
--
-- Desenho (ver shared/types/dir.ts e server/utils/dirMappers.ts):
--   * colunas planas, sem jsonb; datas como `date`, booleanos como `boolean`;
--   * texto livre em `text` SEM enum e SEM CHECK (vendedor, fornecedor, despachante, banco…):
--     as listas da DIR vivem em shared/constants/dir.ts e só alimentam os selects;
--   * o ÚNICO CHECK de lista é `status` (nulo permitido);
--   * `po` NÃO é único: o mesmo PO pode ter ordem 1 e ordem 2 (complemento) — índice comum;
--   * sem coluna `empresa` (a DIR é só Farmaurora).
--
-- Acesso: o app fala com esta tabela SEMPRE pelo servidor, com a service role (RBAC em
-- shared/utils/rbac.ts, seção "dir": operacional e administrador). RLS ligado e SEM policies:
-- anon/authenticated não leem nem escrevem nada direto.

create table if not exists public.dir (
  id text primary key,
  po text not null,
  paciente text not null,
  conferido boolean not null default false,
  vendedor text not null,
  responsavel text,
  exigencia boolean not null default false,
  data_emissao date,
  data_cobranca_fornecedores date,
  receita text,
  medicamento text,
  temperatura text,
  fornecedor text,
  origem text,
  envio text,
  awb text,
  despachante text,
  status text,
  data_entrega date,
  contrato_cambio text,
  observacao text,
  banco text,
  data_pagamento date,
  operacao_encerrada boolean not null default false,
  dactes boolean not null default false,
  dsi_dir_duimp boolean not null default false,
  logger boolean not null default false,
  fechamento boolean not null default false,
  numerario boolean not null default false,
  protocolo_assinado boolean not null default false,
  swift boolean not null default false,
  termometro boolean not null default false,
  -- Lista "Fechamentos restantes": marcação manual no PO (operacional/administrador). A lista da
  -- página é a VISÃO dos POs com fechamento_restante = true E operacao_encerrada = false; a marca
  -- NÃO é apagada ao encerrar a operação (reabrir devolve o PO à lista). _em/_por são preenchidos
  -- pelo servidor ao marcar (e zerados ao desmarcar); a carga inicial grava "importação da planilha".
  fechamento_restante boolean not null default false,
  fechamento_restante_em timestamptz,
  fechamento_restante_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dir_po_formato check (po ~ '^PO[0-9]{2}-[0-9]{2}-[0-9]{4}$'),
  constraint dir_status_valido check (status is null or status in ('on_going', 'entregue', 'cancelado', 'falecimento')),
  constraint dir_fechamento_restante_auditoria check (
    fechamento_restante or (fechamento_restante_em is null and fechamento_restante_por is null)
  )
);

create index if not exists dir_po_idx on public.dir (po);
create index if not exists dir_operacao_encerrada_idx on public.dir (operacao_encerrada);
create index if not exists dir_fechamento_restante_idx on public.dir (fechamento_restante) where fechamento_restante;

alter table public.dir enable row level security;

grant select, insert, update, delete on public.dir to service_role;
