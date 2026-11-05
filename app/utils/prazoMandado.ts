import type { Processo, StatusProcesso } from "#shared/types/processo";
import type { Role } from "#shared/utils/rbac";
import { diferencaEmDias, hojeBrasilia } from "#shared/utils/dataBrasilia";
import { podeVerAlertaMandado } from "#shared/utils/mandadoPermissao";
import { parseDataBR } from "./prazoFornecedor";

// Prazo em dias CORRIDOS depois do registro do LPCO (dia do registro = dia 0) para avisar o
// operacional responsável de que é preciso solicitar o Mandado de Segurança.
export const PRAZO_MANDADO_DIAS = 7;

// Só processos nestes status geram o alerta.
export const STATUS_ALERTAVEIS_MANDADO: readonly StatusProcesso[] = ["desembaraco"];

// Primeira data NO INÍCIO do texto livre (DD/MM ou DD/MM/AAAA). O que vier depois é ignorado
// ("15/09; aguardando análise", "29/09 - agd. análise - prazo até dia 13/10"). O lookahead
// recusa continuações como "25/08/26" (ano de 2 dígitos) ou "25/082": melhor não alertar do que
// assumir um ano errado.
const PRIMEIRA_DATA_RE = /^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?![\d/])/;

export interface NotificacaoMandado {
  processoId: string;
  paciente: string;
  pasta: string;
  responsavel: string;
  // Data do registro do LPCO interpretada ("YYYY-MM-DD") e a mesma em "DD/MM" para exibir.
  registroLpco: string;
  registroDDMM: string;
  diasDecorridos: number;
}

// Interpreta o registro do LPCO como data civil "YYYY-MM-DD", ou null se o texto não começa com
// uma data válida. Sem ano: ano corrente de Brasília e, como o registro nunca é futuro, se a data
// cair depois de hoje usa o ano anterior (corrige a virada de ano só neste alerta).
export function interpretarRegistroLpco(texto: string | undefined | null, hoje: Date = new Date()): string | null {
  if (!texto) return null;
  const m = PRIMEIRA_DATA_RE.exec(texto);
  if (!m) return null;

  const [, dia, mes, ano] = m;
  const token = `${dia}/${mes}${ano ? `/${ano}` : ""}`;
  const iso = parseDataBR(token, hoje);
  if (!iso) return null;
  if (ano) return iso;

  if (iso <= hojeBrasilia(hoje)) return iso;
  const anoAnterior = Number(iso.slice(0, 4)) - 1;
  return parseDataBR(`${dia}/${mes}/${anoAnterior}`, hoje);
}

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

// Lógica pura (sem API): `hoje` injetável para testar. Toda a conta é em datas civis de Brasília.
// Alerta quando hoje >= registro + PRAZO_MANDADO_DIAS. Mais antigos primeiro.
export function calcularNotificacoesMandado(processos: Processo[], hoje: Date = new Date()): NotificacaoMandado[] {
  const hojeISO = hojeBrasilia(hoje);
  const notificacoes: NotificacaoMandado[] = [];

  for (const processo of processos) {
    if (processo.alertaMandadoResolvido) continue;
    if (!STATUS_ALERTAVEIS_MANDADO.includes(processo.status)) continue;

    const registro = interpretarRegistroLpco(processo.datas.registroLpco, hoje);
    if (!registro) continue;

    const diasDecorridos = diferencaEmDias(hojeISO, registro);
    if (diasDecorridos < PRAZO_MANDADO_DIAS) continue;

    notificacoes.push({
      processoId: processo.id,
      paciente: processo.paciente,
      pasta: processo.pasta,
      responsavel: processo.responsavelOperacional ?? "",
      registroLpco: registro,
      registroDDMM: ddmm(registro),
      diasDecorridos,
    });
  }

  return notificacoes.sort((a, b) => b.diasDecorridos - a.diasDecorridos);
}

// Mesmo cálculo já filtrado pela visibilidade do usuário (o que o sino mostra).
export function calcularNotificacoesMandadoDoUsuario(
  processos: Processo[],
  usuario: { role: Role | null | undefined; nome?: string | null },
  hoje: Date = new Date(),
): NotificacaoMandado[] {
  return calcularNotificacoesMandado(processos, hoje).filter((n) => podeVerAlertaMandado(usuario, n.responsavel));
}
