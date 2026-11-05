-- Alerta "Solicitar Mandado de Segurança" (sino): coluna follow_up.alerta_mandado_resolvido.
--
-- Já aplicada em produção (a coluna existe: boolean NOT NULL DEFAULT false). Este arquivo é o registro
-- versionado — o código atual só funciona com a coluna presente.
--
-- Idempotente e SEM risco de re-marcar: o bloco só mexe em algo quando a coluna ainda NÃO existe.
-- Rodar de novo (depois de alguém já ter resolvido/reaberto alertas) não toca em nenhum valor.

do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'follow_up'
       and column_name = 'alerta_mandado_resolvido'
  ) then
    -- 1) Coluna nova: false = alerta ainda pode disparar; true = resolvido (some do sino para todos).
    alter table public.follow_up
      add column alerta_mandado_resolvido boolean not null default false;

    -- 2) Carga inicial: só os processos que o alerta olharia (status 'desembaraco' e registro_lpco
    --    preenchido) E que JÁ mencionam "mandado" em alguma atualização da timeline
    --    (jsonb [{data, texto}]) entram como resolvidos. Critério por TEXTO, não por id fixo.
    --    ILIKE ignora maiúsculas; "mandado" casa também "Mandado de Segurança" e "mandados".
    --    Processos fora de 'desembaraco' ou sem registro_lpco ficam intocados (false).
    update public.follow_up f
       set alerta_mandado_resolvido = true
     where f.status = 'desembaraco'
       and nullif(btrim(coalesce(f.registro_lpco, '')), '') is not null
       and exists (
         select 1
           from jsonb_array_elements(coalesce(f.atualizacoes, '[]'::jsonb)) as a
          where coalesce(a ->> 'texto', '') ilike '%mandado%'
       );
  end if;
end
$$;
