import { hojeBrasilia } from "#shared/utils/dataBrasilia";
import { interpretarValor } from "./calendario";

// Previsão de entrega no card do Kanban (célula à direita de "Cia · AWB"). O campo `previsao_entrega` é texto livre:
// - "DD/MM/AAAA" → "DD/MM" (sem o ano; o ano fica só no title);
// - "DD/MM" (formato antigo) → como está;
// - qualquer outro texto anotado ("20/11 (aguardando voo)") → como está (quem corta com "…" é o card);
// - vazio ou só espaços → null (o card não mostra nada).
// A validade da data vem do mesmo leitor do calendário (interpretarValor); data impossível ("31/02/2026") é só texto.

export interface PrevisaoCard {
  /** O que aparece no card. */
  curto: string;
  /** Texto inteiro (com o ano, quando houver), para o title. */
  completo: string;
}

const DIA_MES_ANO_RE = /^(\d{1,2})\/(\d{1,2})\/\d{4}$/;

const doisDigitos = (n: string): string => n.padStart(2, "0");

export function previsaoParaCard(texto: string | null | undefined, hojeIso: string = hojeBrasilia()): PrevisaoCard | null {
  const completo = typeof texto === "string" ? texto.trim() : "";
  if (!completo) return null;

  if (interpretarValor(completo, "dd/mm", hojeIso).tipo === "data") {
    const comAno = DIA_MES_ANO_RE.exec(completo);
    if (comAno) return { curto: `${doisDigitos(comAno[1]!)}/${doisDigitos(comAno[2]!)}`, completo };
  }
  return { curto: completo, completo };
}
