import type { FornecedorProcesso, Processo } from "#shared/types/processo";
import { diferencaEmDias, hojeBrasilia, parseDataISO, somarDiasISO } from "#shared/utils/dataBrasilia";

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

const DATA_BR_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;

// Parse defensivo de "DD/MM" ou "DD/MM/AAAA" para uma data civil "YYYY-MM-DD" (ano assumido
// como o ano corrente de Brasília quando omitido). Qualquer outro texto (ex.: "ASD", "já tem",
// string vazia) ou data que não existe (31/02) retorna null — nunca lança erro, nunca inventa
// uma data. Sem `Date` local: o resultado não depende do fuso da máquina.
export function parseDataBR(str: string | undefined | null, hoje: Date = new Date()): string | null {
  if (!str) return null;
  const match = str.trim().match(DATA_BR_RE);
  if (!match) return null;

  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = match[3] ? Number(match[3]) : Number(hojeBrasilia(hoje).slice(0, 4));
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const iso = `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  // parseDataISO rejeita datas inexistentes (ex.: 31/02), que um `new Date` normalizaria em silêncio.
  return parseDataISO(iso) ? iso : null;
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
    if (processo.datas.aberturaThread?.trim()) continue;

    const fornecedor = processo.fornecedor;
    if (!fornecedor) continue;
    const prazoDias = PRAZO_DIAS_POR_FORNECEDOR[fornecedor as FornecedorProcesso];
    if (prazoDias === undefined) continue;

    const dataCompra = parseDataBR(processo.datas.dataCompraPO, hoje);
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
