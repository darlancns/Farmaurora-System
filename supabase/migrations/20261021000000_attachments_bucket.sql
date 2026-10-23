-- Bucket PRIVADO de anexos das prestações + policies de RLS.
--
-- Aplicação MANUAL (revisar antes): Supabase Dashboard → SQL Editor → colar e rodar.
-- É idempotente (pode rodar de novo sem efeito colateral).
--
-- Caminho dos arquivos: <patientId>/<slotKey>.png  (ver shared/utils/attachments.ts)
--
-- O app acessa o Storage SEMPRE pelo servidor, com a service role (que ignora RLS) —
-- o RBAC de verdade é o de server/middleware/auth.ts. Estas policies protegem o
-- acesso DIRETO (chave anon + JWT do usuário): sem policy pro anon (negado) e, pro
-- usuário autenticado, só nos caminhos esperados e só pros cargos abaixo.
--
-- Cargos = seção "patients" de shared/utils/rbac.ts (leitura: READ_ACCESS.patients;
-- escrita: WRITE_ACCESS.patients). tests/unit/attachmentsMigration.spec.ts falha se
-- as listas daqui divergirem do rbac.ts — mexeu num lado, mexa no outro.
--
-- Limitação: o cargo vem do JWT (app_metadata.role) e só vale depois que o token
-- renova (até ~1h após uma troca de cargo). Contas sem app_metadata.role (fallback
-- NUXT_ADMIN_EMAILS) não passam por estas policies — o fluxo pelo servidor não é afetado.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 20971520, array['image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.attachments_role_in(roles text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = any (roles)
$$;

drop policy if exists attachments_select on storage.objects;
create policy attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and name ~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\.png$'
    and public.attachments_role_in(array['socio', 'administrador'])
  );

drop policy if exists attachments_insert on storage.objects;
create policy attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and name ~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\.png$'
    and public.attachments_role_in(array['socio', 'administrador'])
  );

drop policy if exists attachments_update on storage.objects;
create policy attachments_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'attachments'
    and name ~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\.png$'
    and public.attachments_role_in(array['socio', 'administrador'])
  )
  with check (
    bucket_id = 'attachments'
    and name ~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\.png$'
    and public.attachments_role_in(array['socio', 'administrador'])
  );

drop policy if exists attachments_delete on storage.objects;
create policy attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and name ~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\.png$'
    and public.attachments_role_in(array['socio', 'administrador'])
  );
