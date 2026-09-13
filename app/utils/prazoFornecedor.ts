import type { FornecedorProcesso, Processo } from "#shared/types/processo";

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

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const DATA_BR_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;

function comHoraZerada(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Parse defensivo de "DD/MM" ou "DD/MM/AAAA" (ano assumido como o ano corrente
// quando omitido). Qualquer outro texto (ex.: "ASD", "já tem", string vazia)
// retorna null — nunca lança erro, nunca inventa uma data.
export function parseDataBR(str: string | undefined | null, hoje: Date = new Date()): Date | null {
  if (!str) return null;
  const match = str.trim().match(DATA_BR_RE);
  if (!match) return null;

  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = match[3] ? Number(match[3]) : hoje.getFullYear();
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const date = new Date(ano, mes - 1, dia);
  // new Date() normaliza datas inválidas silenciosamente (ex.: 31/02 vira
  // 03/03) — confere que os componentes voltam iguais pra rejeitar isso.
  if (date.getFullYear() !== ano || date.getMonth() !== mes - 1 || date.getDate() !== dia) return null;

  return date;
}

export interface NotificacaoFornecedor {
  processoId: string;
  paciente: string;
  pasta: string;
  fornecedor: string;
  diasDeAtraso: number;
}

// Lógica pura, sem chamada de API — recebe a lista de processos já carregada
// e (opcionalmente) uma data de referência pra "hoje", pra dar pra testar de
// forma determinística. diasDeAtraso é quantos dias já passaram do prazo
// final (dataCompraPO + prazo do fornecedor), não do dia da compra em si.
export function calcularNotificacoesFornecedor(
  processos: Processo[],
  hoje: Date = new Date()
): NotificacaoFornecedor[] {
  const hojeZerado = comHoraZerada(hoje);
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

    const prazoFinal = new Date(dataCompra);
    prazoFinal.setDate(prazoFinal.getDate() + prazoDias);
    const prazoFinalZerado = comHoraZerada(prazoFinal);

    if (hojeZerado < prazoFinalZerado) continue;

    const diasDeAtraso = Math.round((hojeZerado.getTime() - prazoFinalZerado.getTime()) / MS_POR_DIA);

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
