-- DIR: companhia aérea separada do AWB — nova coluna companhia_aerea (text, opcional), o mesmo nome da coluna do Follow-Up.
--
-- ADITIVA e IDEMPOTENTE: só acrescenta uma coluna nula, sem default, sem constraint e sem índice (sem CHECK por enquanto:
-- o valor é texto livre, como as demais listas da DIR). Linhas existentes ficam com NULL e o código antigo continua
-- funcionando (select("*") ignora a coluna nova). A coluna `awb` NÃO muda: as linhas antigas seguem com o texto bruto
-- ("Lufthansa: 020-01045494") até o passo de dados que separa cia e número.
--
-- ORDEM DE APLICAÇÃO: aplicar ESTA migração ANTES do deploy do código. O formulário novo envia companhiaAerea em todo
-- salvar; sem a coluna, criar ou editar um PO da DIR falha.

alter table public.dir add column if not exists companhia_aerea text;
