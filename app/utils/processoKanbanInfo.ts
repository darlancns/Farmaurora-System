import type { Processo } from "#shared/types/processo";
import { formatarDataBR, formatarDiaMes } from "#shared/utils/dataBrasilia";
import type { ChaveIconeCard, ChaveIconeEstado } from "./processoIcones";
import { controlesEntregaParaTela } from "./processoControlesEntrega";
import { nomeFornecedorCurto } from "./nomeFornecedorCurto";
import { previsaoParaCard } from "./processoPrevisaoCard";

// "Bloquinhos" do card do Kanban: decide o que aparece em cada linha/célula e já devolve os valores formatados.
// O componente só renderiza. Regras:
// - linha "pessoas": Responsável, Consultor, Pendências (esta só com quantidade > 0);
// - linha "origem": Fornecedor (nome curto, sem o país) e Despachante;
// - linha "aereo": a célula "Cia · AWB" (só a cia, só a AWB, ou as duas) e, à direita dela, a célula da previsão de
//   entrega (sempre só DD/MM, sem ícone — ver processoPrevisaoCard.ts). Sem Cia e sem AWB mas com previsão: a linha
//   existe só com a data. Sem previsão (vazia ou sem data reconhecível): nenhuma célula de data, nada muda.
//   Em ENTREGUE com data de entrega válida, a célula mostra a DATA DE ENTREGA (mesmo visual, só DD/MM, title "Entregue em
//   DD/MM/AAAA") no lugar da previsão; Entregue antigo (sem data de entrega) e os outros status seguem com a previsão;
// - linha "controles" (depois da aérea): SÓ em Entregue e só com ao menos um controle aplicável com valor — Pagamento da
//   transportadora ("AJC pendente") e DIR ("Pegar DIR e Protocolo"), lado a lado. Ver processoControlesEntrega.ts;
// - célula vazia (ausente ou só espaços) não existe; linha sem células não existe.

export type ChaveCelulaKanban = ChaveIconeCard | "previsao" | "entrega" | "controle-pagamento" | "controle-dir";
export type ChaveLinhaKanban = "pessoas" | "origem" | "aereo" | "controles";

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
  // Célula da data: nunca encolhe nem corta (são sempre 5 caracteres, "DD/MM"). Não tem ícone.
  fixa?: boolean;
  // Só nas células de controle do Entregue: pendente (âmbar, relógio) ou concluído (verde, check em círculo).
  estado?: ChaveIconeEstado;
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
  previsao: "Previsão de entrega",
  entrega: "Data de entrega",
  "controle-pagamento": "Pagamento da transportadora",
  "controle-dir": "DIR e Protocolo",
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

function celulaPrevisao(texto: string | undefined): CelulaInfoKanban | null {
  const previsao = previsaoParaCard(texto);
  if (!previsao) return null;
  return {
    chave: "previsao",
    rotulo: ROTULOS_INFO_KANBAN.previsao,
    texto: previsao.curto,
    titulo: `${ROTULOS_INFO_KANBAN.previsao}: ${previsao.completo}`,
    fixa: true,
  };
}

function celulaEntrega(dataIso: string | undefined): CelulaInfoKanban | null {
  const iso = limpo(dataIso);
  const curto = formatarDiaMes(iso);
  if (!curto) return null;
  return {
    chave: "entrega",
    rotulo: ROTULOS_INFO_KANBAN.entrega,
    texto: curto,
    titulo: `Entregue em ${formatarDataBR(iso)}`,
    fixa: true,
  };
}

function celulasControles(processo: ProcessoInfoKanban): CelulaInfoKanban[] {
  if (!processo.status) return [];
  return controlesEntregaParaTela({
    status: processo.status,
    modalEnvio: processo.modalEnvio,
    transportadoraNacional: processo.transportadoraNacional,
    pagamentoTransportadora: processo.pagamentoTransportadora,
    dirProtocolo: processo.dirProtocolo,
  }).map((c) => {
    const chave = c.chave === "pagamento" ? "controle-pagamento" : "controle-dir";
    return { chave, rotulo: c.rotulo, texto: c.texto, titulo: `${c.rotulo}: ${c.texto}`, estado: c.estado } satisfies CelulaInfoKanban;
  });
}

function linha(chave: ChaveLinhaKanban, celulas: Array<CelulaInfoKanban | null>): LinhaInfoKanban | null {
  const presentes = celulas.filter((c): c is CelulaInfoKanban => c !== null);
  return presentes.length ? { chave, celulas: presentes } : null;
}

export type ProcessoInfoKanban = Pick<
  Processo,
  "responsavelOperacional" | "consultor" | "pendencias" | "fornecedor" | "despachante" | "companhiaAerea" | "numeroAwb"
> & {
  datas?: Partial<Pick<NonNullable<Processo["datas"]>, "previsaoEntrega" | "dataEntrega">>;
  // Os campos do Entregue são opcionais: sem `status` (ou fora de Entregue) o card é o de sempre.
  status?: Processo["status"];
  modalEnvio?: Processo["modalEnvio"];
  transportadoraNacional?: Processo["transportadoraNacional"];
  pagamentoTransportadora?: Processo["pagamentoTransportadora"];
  dirProtocolo?: Processo["dirProtocolo"];
};

export function linhasInfoKanban(processo: ProcessoInfoKanban): LinhaInfoKanban[] {
  const aereo = celulaAereo(limpo(processo.companhiaAerea), limpo(processo.numeroAwb));
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
    linha("aereo", [
      aereo,
      // Entregue com data de entrega válida mostra ela; senão (Entregue antigo, outros status) a previsão, como sempre.
      (processo.status === "entregue" ? celulaEntrega(processo.datas?.dataEntrega) : null) ??
        celulaPrevisao(processo.datas?.previsaoEntrega),
    ]),
    linha("controles", celulasControles(processo)),
  ].filter((l): l is LinhaInfoKanban => l !== null);
}
