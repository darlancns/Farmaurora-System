import { precisaDespachanteTransportadora } from "#shared/constants/processos";
import type { Medicamento, Processo } from "#shared/types/processo";
import { linhaLaboratorioBrand } from "#shared/utils/laboratorio";
import { formatarDataBR } from "#shared/utils/dataBrasilia";
import { formatCurrency } from "./formatters";

// Regras puras do painel lateral do Kanban (app/components/processos/ProcessoPainel.vue). Testadas em
// tests/unit/processoPainelComponentes.spec.ts.

/** Blocos do painel, NA ORDEM da tela (ids `painel-bloco-<id>`). */
export const BLOCOS_PAINEL = [
  "cabecalho",
  "pessoas",
  "envio",
  "entrega",
  "numero-processo",
  "datas",
  "pendencias",
  "atualizacoes",
  "rodape",
] as const;

export interface ItemMedicamentoPainel {
  /** "Qtd. — nome (dosagem)"; sem quantidade, só o nome. */
  linha: string;
  /** "Laboratório · Brand" (só as partes preenchidas), ou "" quando o item não tem nenhum dos dois. */
  extra: string;
  /** Só a quantidade ("6 caixas"), ou "" sem quantidade. A `linha` é `${quantidade} — ${nome}`. (Campo aditivo.) */
  quantidade: string;
  /** Só o nome com a dosagem ("Opdivo 40mg"). (Campo aditivo.) */
  nome: string;
}

/** Os itens do bloco Medicamento(s), na ordem da lista. Itens sem nome não aparecem. */
export function itensMedicamentos(medicamentos: readonly Medicamento[]): ItemMedicamentoPainel[] {
  return medicamentos
    .filter((m) => m.nome.trim() !== "")
    .map((m) => {
      const nome = [m.nome.trim(), m.dosagem?.trim()].filter(Boolean).join(" ");
      const qtd = m.quantidade?.trim();
      return { linha: qtd ? `${qtd} — ${nome}` : nome, extra: linhaLaboratorioBrand(m), quantidade: qtd ?? "", nome };
    });
}

/** "Qtd. — nome (dosagem)": cada item numa linha; sem quantidade, só o nome. Itens sem nome não aparecem. */
export function linhasMedicamentos(medicamentos: readonly Medicamento[]): string[] {
  return itensMedicamentos(medicamentos).map((item) => item.linha);
}

/**
 * Despachante e Transportadora aparecem? Mesma regra do formulário (precisaDespachanteTransportadora): Courier
 * Simples esconde os dois; qualquer outro envio (inclusive vazio ou o legado "Courier") mostra.
 */
export function mostraDespachanteTransportadora(processo: Pick<Processo, "modalEnvio">): boolean {
  return precisaDespachanteTransportadora(processo.modalEnvio);
}

/** "Nome · Cotação · R$ valor" (só as partes preenchidas), ou "" sem transportadora. */
export function linhaTransportadora(processo: Pick<Processo, "transportadoraNacional">): string {
  const t = processo.transportadoraNacional;
  if (!t) return "";
  return [t.nome, t.cotacao, t.valor !== undefined ? `R$ ${formatCurrency(t.valor)}` : ""].filter(Boolean).join(" · ");
}

export interface CampoData {
  id: string;
  rotulo: string;
  valor: string;
  destaque?: boolean;
  larguraTotal?: boolean;
}

/**
 * As 11 datas, na ordem da tela (a mesma do detalhe da Lista e do formulário). As 9 de texto aparecem como estão
 * gravadas (inclusive texto antigo); MS Anexado em e Prazo da ANVISA ("AAAA-MM-DD") aparecem com o ano, DD/MM/AAAA.
 */
// "AAAA-MM-DD" -> "DD/MM/AAAA"; vazio -> ""; valor que não é ISO (não deveria existir) aparece como está.
function dataIsoParaTela(valor: string | undefined): string {
  const texto = (valor ?? "").trim();
  return texto ? formatarDataBR(texto) || texto : "";
}

export function camposDatas(processo: Pick<Processo, "datas">): CampoData[] {
  const d = processo.datas;
  return [
    { id: "data-compra-po", rotulo: "Compra (PO)", valor: d.dataCompraPO ?? "" },
    { id: "data-embarque", rotulo: "Embarque", valor: d.dataEmbarque ?? "" },
    { id: "abertura-thread", rotulo: "Abertura thread", valor: d.aberturaThread ?? "" },
    { id: "chegada-brasil", rotulo: "Chegada Brasil", valor: d.dataChegadaBrasil ?? "" },
    { id: "registro-radar", rotulo: "Registro Radar", valor: d.registroRadar ?? "" },
    { id: "registro-duimp", rotulo: "Registro Duimp", valor: d.registroDuimp ?? "" },
    { id: "registro-lpco", rotulo: "Registro Lpco", valor: d.registroLpco ?? "" },
    { id: "ms-anexado", rotulo: "MS Anexado em", valor: dataIsoParaTela(d.msAnexadoEm) },
    { id: "prazo-anvisa", rotulo: "Prazo da ANVISA", valor: dataIsoParaTela(d.prazoAnvisa) },
    { id: "previsao-entrega", rotulo: "Previsão entrega", valor: d.previsaoEntrega ?? "", destaque: true },
    { id: "suposta-estimativa", rotulo: "Suposta estimativa", valor: d.supostaEstimativa ?? "", larguraTotal: true },
  ];
}

/**
 * Só as datas PREENCHIDAS (texto não vazio depois de trim; texto antigo com anotação conta), na ordem da tela. É o que
 * o painel do Kanban e o detalhe da Lista mostram: data vazia não aparece (nem o rótulo, nem "—"); sem nenhuma, a seção
 * Datas some. O formulário continua com todos os campos (camposDatas).
 */
export function camposDatasPreenchidos(processo: Pick<Processo, "datas">): CampoData[] {
  return camposDatas(processo).filter((c) => c.valor.trim() !== "");
}

/** Há algum modal (BaseModal) aberto? Enquanto houver, o Esc é dele, não do painel. */
export function haModalAberto(raiz: ParentNode | null | undefined = typeof document !== "undefined" ? document : null): boolean {
  return Boolean(raiz?.querySelector('[data-overlay="modal"]'));
}

const SELETOR_FOCAVEL =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Elementos focáveis dentro de `raiz`, na ordem do DOM. */
export function focaveis(raiz: HTMLElement): HTMLElement[] {
  return [...raiz.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)].filter((el) => !el.hasAttribute("inert"));
}
