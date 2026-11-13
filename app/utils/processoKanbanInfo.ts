import type { Processo } from "#shared/types/processo";
import { nomeFornecedorCurto } from "./nomeFornecedorCurto";

// "Bloquinhos" do card do Kanban: decide o que aparece em cada linha/célula e já devolve os valores formatados.
// O componente só renderiza. Regras:
// - linha "pessoas": Responsável, Consultor, Pendências (esta só com quantidade > 0);
// - linha "origem": Fornecedor (nome curto, sem o país) e Despachante;
// - linha "aereo": uma célula "Cia · AWB" (só a cia, só a AWB, ou as duas);
// - célula vazia (ausente ou só espaços) não existe; linha sem células não existe.

export type ChaveCelulaKanban = "responsavel" | "consultor" | "pendencias" | "fornecedor" | "despachante" | "aereo";
export type ChaveLinhaKanban = "pessoas" | "origem" | "aereo";

export interface CelulaInfoKanban {
  chave: ChaveCelulaKanban;
  // Rótulo só para leitor de tela (sr-only); não aparece na tela.
  rotulo: string;
  // Texto principal (fonte normal). Pode ser "" na célula aérea quando só há AWB.
  texto: string;
  // Número da AWB (fonte monoespaçada). Só na célula aérea.
  awb?: string;
  // Texto completo para o atributo title (o visível corta com "…").
  titulo: string;
  // Célula estreita (não cresce): as pendências.
  estreita?: boolean;
  // Cor de perigo: as pendências.
  perigo?: boolean;
  // Não encolhe antes das outras (até 45% da linha): o Responsável, nome curto que viraria "Re…" ao lado de um
  // consultor longo.
  prioritaria?: boolean;
}

export interface LinhaInfoKanban {
  chave: ChaveLinhaKanban;
  celulas: CelulaInfoKanban[];
}

export const ROTULOS_INFO_KANBAN: Record<ChaveCelulaKanban, string> = {
  responsavel: "Responsável",
  consultor: "Consultor",
  pendencias: "Pendências",
  fornecedor: "Fornecedor",
  despachante: "Despachante",
  aereo: "Cia. aérea · AWB",
};

function limpo(valor: string | null | undefined): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function celulaTexto(chave: ChaveCelulaKanban, valor: string): CelulaInfoKanban | null {
  if (!valor) return null;
  return { chave, rotulo: ROTULOS_INFO_KANBAN[chave], texto: valor, titulo: valor };
}

function prioritaria(celula: CelulaInfoKanban | null): CelulaInfoKanban | null {
  return celula ? { ...celula, prioritaria: true } : null;
}

function celulaPendencias(qtd: number): CelulaInfoKanban | null {
  if (qtd <= 0) return null;
  return {
    chave: "pendencias",
    rotulo: ROTULOS_INFO_KANBAN.pendencias,
    texto: String(qtd),
    titulo: `${qtd} ${qtd === 1 ? "pendência" : "pendências"}`,
    estreita: true,
    perigo: true,
  };
}

function celulaAereo(cia: string, awb: string): CelulaInfoKanban | null {
  if (!cia && !awb) return null;
  return {
    chave: "aereo",
    rotulo: ROTULOS_INFO_KANBAN.aereo,
    texto: cia,
    ...(awb ? { awb } : {}),
    titulo: [cia, awb].filter(Boolean).join(" · "),
  };
}

function linha(chave: ChaveLinhaKanban, celulas: Array<CelulaInfoKanban | null>): LinhaInfoKanban | null {
  const presentes = celulas.filter((c): c is CelulaInfoKanban => c !== null);
  return presentes.length ? { chave, celulas: presentes } : null;
}

export type ProcessoInfoKanban = Pick<
  Processo,
  "responsavelOperacional" | "consultor" | "pendencias" | "fornecedor" | "despachante" | "companhiaAerea" | "numeroAwb"
>;

export function linhasInfoKanban(processo: ProcessoInfoKanban): LinhaInfoKanban[] {
  const qtdPendencias = Array.isArray(processo.pendencias) ? processo.pendencias.length : 0;
  return [
    linha("pessoas", [
      prioritaria(celulaTexto("responsavel", limpo(processo.responsavelOperacional))),
      celulaTexto("consultor", limpo(processo.consultor)),
      celulaPendencias(qtdPendencias),
    ]),
    linha("origem", [
      celulaTexto("fornecedor", nomeFornecedorCurto(processo.fornecedor)),
      celulaTexto("despachante", limpo(processo.despachante)),
    ]),
    linha("aereo", [celulaAereo(limpo(processo.companhiaAerea), limpo(processo.numeroAwb))]),
  ].filter((l): l is LinhaInfoKanban => l !== null);
}
