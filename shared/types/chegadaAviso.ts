// Dispensa ("olhinho") do aviso "chegou?" gravada para UM administrador: vale para a combinação processo +
// data prevista (YYYY-MM-DD). Se a data prevista mudar, o aviso volta. Tabela public.chegada_avisos_vistos.
export interface ChegadaAvisoVisto {
  processoId: string;
  dataPrevista: string;
}

// Corpo de POST /api/processos/:id/chegada.
export type ChegadaPedidoDTO = { acao: "confirmar" } | { acao: "adiar"; novaData: string };
