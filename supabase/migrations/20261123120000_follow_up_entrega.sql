-- JÁ APLICADA MANUALMENTE EM PRODUÇÃO EM 23/11/2026; NÃO REAPLICAR.
-- (Este arquivo existe só para o repositório ficar fiel ao banco. É idempotente, mas não há motivo para rodá-lo de novo em produção.)
--
-- Follow-Up: regra do status "Entregue". Três colunas novas, todas nulas:
--  - data_entrega             date NULL: dia em que o processo foi entregue ("Data de entrega"). Coluna `date` como
--    ms_anexado_em e prazo_anvisa: NÃO aceita "" (o código grava NULL para campo vazio) e o servidor recusa (400) data que
--    não seja AAAA-MM-DD válida ou que seja futura.
--  - pagamento_transportadora text NULL: 'pendente' | 'pago'. Só vale com status Entregue e transportadora AJC ou Doctor
--    (o rótulo "AJC pendente" / "Doctor pago" vem do NOME da transportadora; o valor guardado é o mesmo para as duas).
--  - dir_protocolo            text NULL: 'pegar_dir_protocolo' | 'pegar_dir' | 'dir_no_drive' | 'dir_protocolo'. Só com
--    envio Courier: Courier Simples usa pegar_dir_protocolo / dir_no_drive / dir_protocolo; Courier Formal usa SÓ pegar_dir /
--    dir_no_drive (o protocolo vem da AJC). A combinação com o envio é conferida no servidor (400), não no banco.
--
-- ADITIVA e idempotente (add column if not exists; as CHECK só são criadas se ainda não existirem, via pg_constraint):
-- sem default, sem índice, SEM backfill. Os processos já Entregues ficam com NULL nos três e nada neles muda.
--
-- O código novo grava e lê estas colunas; a leitura com select("*") funciona mesmo sem elas.
--
-- Desfazer (só depois de reverter o código que lê/grava estas colunas; perde o que foi preenchido):
--   alter table public.follow_up drop constraint if exists follow_up_pagamento_transportadora_valores;
--   alter table public.follow_up drop constraint if exists follow_up_dir_protocolo_valores;
--   alter table public.follow_up drop column if exists data_entrega;
--   alter table public.follow_up drop column if exists pagamento_transportadora;
--   alter table public.follow_up drop column if exists dir_protocolo;

alter table public.follow_up add column if not exists data_entrega date;
alter table public.follow_up add column if not exists pagamento_transportadora text;
alter table public.follow_up add column if not exists dir_protocolo text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'follow_up_pagamento_transportadora_valores'
      and conrelid = 'public.follow_up'::regclass
  ) then
    alter table public.follow_up
      add constraint follow_up_pagamento_transportadora_valores
      check (pagamento_transportadora is null or pagamento_transportadora in ('pendente', 'pago'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'follow_up_dir_protocolo_valores'
      and conrelid = 'public.follow_up'::regclass
  ) then
    alter table public.follow_up
      add constraint follow_up_dir_protocolo_valores
      check (dir_protocolo is null
             or dir_protocolo in ('pegar_dir_protocolo', 'pegar_dir', 'dir_no_drive', 'dir_protocolo'));
  end if;
end
$$;
