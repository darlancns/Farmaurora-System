// Grade da lista da DIR em lg+ (cabeçalho em DirList.vue e linhas em DirRow.vue usam a MESMA
// grade). Colunas: Conferido · PO · Paciente · Medicamento · Consultor · Resp. · Fornecedor ·
// Emissão · Status · Banco (chip) · Checklist. Abaixo de lg a lista vira cartão e esta grade não vale.
export const DIR_GRID_CLASS =
  "lg:grid lg:min-w-[1060px] lg:grid-cols-[2rem_6.5rem_minmax(8rem,1.6fr)_minmax(6rem,1.2fr)_6rem_4rem_6rem_5.5rem_7rem_7rem_3.5rem] lg:items-center lg:gap-x-2";

// Grade da lista agrupada "Fechamentos restantes" (DirFechamentosList.vue), em lg+. Colunas:
// (N) · PO · Medicamento · Status · Banco (chip) · Checklist · Remover.
export const DIR_FECHAMENTOS_GRID_CLASS =
  "lg:grid lg:min-w-[860px] lg:grid-cols-[3rem_7rem_minmax(8rem,1fr)_7.5rem_7rem_3.5rem_5.5rem] lg:items-center lg:gap-x-3";
