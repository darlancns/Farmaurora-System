import type { FornecedorProcesso, Processo, StatusProcesso } from "#shared/types/processo";
import { DATA_BR_RE, diferencaEmDias, hojeBrasilia, parseDataBR, somarDiasISO } from "#shared/utils/dataBrasilia";

// parseDataBR mora em shared/utils/dataBrasilia.ts (o servidor também usa); continua exportado daqui.
export { parseDataBR };

// Prazo em dias CORRIDOS a partir de datas.dataCompraPO (dia da compra = dia 0)
// pra cobrar o fornecedor caso não haja sinal de envio (abertura de thread).
// Qualquer fornecedor fora desta tabela (ex.: "Outro", "Upharm", ou um valor
// legado sem sufixo de país como "Poros" sozinho) não tem prazo definido —
// não gera alerta. Não inferir por aproximação de nome.
const PRAZO_DIAS_POR_FORNECEDOR: Partial<Record<FornecedorProcesso, number>> = {
  "Poros - Turquia": 3,
  "Speciality - Índia": 3,
  "Beldimed - Bélgica": 7,
  "Pharyx - China": 10,
};

// Só processos nestes status geram o alerta de prazo do fornecedor (cobrar o fornecedor só faz sentido
// enquanto a compra ainda está sendo encaminhada). Fácil de alterar: é a única lista.
export const STATUS_ALERTAVEIS_FORNECEDOR: readonly StatusProcesso[] = ["elaboracao_fornecedores"]; // só Na origem

// Primeira data NO INÍCIO do texto livre (DD/MM ou DD/MM/AAAA); o resto é ignorado. O lookahead recusa
// continuações como "04/11/26" ou "04/112": melhor não suprimir o alerta do que assumir uma data errada.
const PRIMEIRA_DATA_RE = /^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?![\d/])/;

// Quantos dias no FUTURO uma data de compra sem ano ainda é aceita como "deste ano" (erro de digitação de poucos
// dias: continua futura, sem alerta). Além disso, uma compra não pode estar no futuro distante: é do ano anterior.
export const TOLERANCIA_COMPRA_FUTURA_DIAS = 60;

// Data de COMPRA interpretada ("YYYY-MM-DD") a partir de datas.dataCompraPO. Mesmo critério estrito de parseDataBR
// (o texto inteiro é DD/MM ou DD/MM/AAAA; qualquer outro texto devolve null), com a correção da virada de ano:
// - com ano explícito (DD/MM/AAAA): o ano do texto, como sempre;
// - sem ano: o ano corrente de Brasília e, se a data ficar MAIS de 60 dias no futuro em relação a hoje, o ano
//   ANTERIOR (uma compra de 28/12 lida em janeiro é de dezembro passado, não do dezembro que vem). De 0 a 60 dias
//   no futuro fica como está (futura): um erro de digitação de poucos dias não dispara alerta.
// A data de EMBARQUE não usa esta regra (embarque futuro é legítimo: planejado) e o alerta de Mandado tem a sua.
export function interpretarDataCompra(str: string | undefined | null, hoje: Date = new Date()): string | null {
  const iso = parseDataBR(str, hoje);
  if (!iso) return null;

  const partes = DATA_BR_RE.exec(str!.trim());
  if (!partes || partes[3]) return iso; // ano explícito

  if (diferencaEmDias(iso, hojeBrasilia(hoje)) <= TOLERANCIA_COMPRA_FUTURA_DIAS) return iso;
  const anoAnterior = Number(iso.slice(0, 4)) - 1;
  return parseDataBR(`${partes[1]}/${partes[2]}/${anoAnterior}`, hoje);
}

// Data de embarque interpretada ("YYYY-MM-DD") a partir do texto livre de datas.dataEmbarque, usando só a
// primeira data do início do texto ("10/11 (previsto)" -> 10/11). Sem ano, ano corrente de Brasília.
// Sem data válida (vazio, "ASD", "semana que vem", 31/02) devolve null — e quem chama não suprime.
export function interpretarDataEmbarque(texto: string | undefined | null, hoje: Date = new Date()): string | null {
  if (!texto) return null;
  const m = PRIMEIRA_DATA_RE.exec(texto);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  return parseDataBR(`${dia}/${mes}${ano ? `/${ano}` : ""}`, hoje);
}

export interface NotificacaoFornecedor {
  processoId: string;
  paciente: string;
  pasta: string;
  fornecedor: string;
  diasDeAtraso: number;
}

// Lógica pura, sem chamada de API — recebe a lista de processos já carregada
// e (opcionalmente) o instante de referência pra "hoje", pra dar pra testar de
// forma determinística. "Hoje" é o dia de Brasília e toda a conta é em datas civis
// (ano/mês/dia), então não depende do fuso da máquina. diasDeAtraso é quantos dias
// já passaram do prazo final (dataCompraPO + prazo do fornecedor), não do dia da
// compra em si.
export function calcularNotificacoesFornecedor(
  processos: Processo[],
  hoje: Date = new Date()
): NotificacaoFornecedor[] {
  const hojeISO = hojeBrasilia(hoje);
  const notificacoes: NotificacaoFornecedor[] = [];

  for (const processo of processos) {
    if (processo.alertaFornecedorResolvido) continue;
    if (!STATUS_ALERTAVEIS_FORNECEDOR.includes(processo.status)) continue;
    if (processo.datas.aberturaThread?.trim()) continue;

    // Embarque agendado para depois de hoje: ainda dentro do combinado, não cobra. No dia do embarque
    // (ou depois) e sem abertura de thread, o alerta volta.
    const embarque = interpretarDataEmbarque(processo.datas.dataEmbarque, hoje);
    if (embarque && embarque > hojeISO) continue;

    const fornecedor = processo.fornecedor;
    if (!fornecedor) continue;
    const prazoDias = PRAZO_DIAS_POR_FORNECEDOR[fornecedor as FornecedorProcesso];
    if (prazoDias === undefined) continue;

    const dataCompra = interpretarDataCompra(processo.datas.dataCompraPO, hoje);
    if (!dataCompra) continue;

    const prazoFinal = somarDiasISO(dataCompra, prazoDias);
    if (hojeISO < prazoFinal) continue;

    const diasDeAtraso = diferencaEmDias(hojeISO, prazoFinal);

    notificacoes.push({
      processoId: processo.id,
      paciente: processo.paciente,
      pasta: processo.pasta,
      fornecedor,
      diasDeAtraso,
    });
  }

  return notificacoes.sort((a, b) => b.diasDeAtraso - a.diasDeAtraso);
}
