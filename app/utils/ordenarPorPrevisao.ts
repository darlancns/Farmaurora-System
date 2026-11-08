import { hojeBrasilia } from "#shared/utils/dataBrasilia";
import { interpretarValor } from "./calendario";

// Ordem da aba Entregues: "Previsão entrega" por DATA REAL (crescente: a mais próxima/antiga primeiro), e não por
// texto ("05/12" vinha antes de "20/08"). O campo é texto livre: vale a primeira data DD/MM ou DD/MM/AAAA do
// INÍCIO do texto ("13/10; deferido 14/10" ordena como 13/10). Sem ano, o ano corrente de Brasília; com ano, o
// do texto. Valor sem data interpretável (vazio, "já tem", "ASD", 31/02...) vai para o FIM, mantendo a ordem
// original entre si. Empates também mantêm a ordem original da lista recebida.

interface ComPrevisao {
  datas: { previsaoEntrega?: string | null };
}

/** "YYYY-MM-DD" da primeira data no início do texto, ou null se não houver uma data válida. */
export function dataDePrevisao(texto: string | null | undefined, hojeIso: string): string | null {
  const lido = interpretarValor(texto ?? "", "dd/mm", hojeIso);
  if (lido.tipo === "data") return lido.iso;
  if (lido.tipo === "texto") return lido.isoInicial;
  return null;
}

/** Nova lista ordenada por previsão de entrega (a original não é alterada). `hoje` existe para testar. */
export function ordenarPorPrevisaoEntrega<T extends ComPrevisao>(lista: readonly T[], hoje: Date = new Date()): T[] {
  const hojeIso = hojeBrasilia(hoje);
  return lista
    .map((item, indice) => ({ item, indice, data: dataDePrevisao(item.datas.previsaoEntrega, hojeIso) }))
    .sort((a, b) => {
      if (a.data === null && b.data === null) return a.indice - b.indice;
      if (a.data === null) return 1;
      if (b.data === null) return -1;
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      return a.indice - b.indice;
    })
    .map((entrada) => entrada.item);
}
