// Previsão de entrega no card do Kanban (célula à direita de "Cia · AWB"). O campo `previsao_entrega` é texto livre
// ("25/11/2026", "25/11", "20/11 (aguardando voo)", "chega 20/11"...). O card mostra SEMPRE só "DD/MM" (dois dígitos):
// a PRIMEIRA data DD/MM (com ou sem ano) que aparecer no texto. Dia 1-31 e mês 1-12; fora disso, ou sem nenhuma data
// reconhecível ("aguardando confirmação"), vazio ou só espaços, devolve null e o card não mostra a célula.
// O texto original inteiro (com o ano, quando houver) vai em `completo`, para o title.

export interface PrevisaoCard {
  /** O que aparece no card: sempre "DD/MM". */
  curto: string;
  /** Texto original inteiro (sem espaços nas pontas), para o title. */
  completo: string;
}

// Não começa nem termina no meio de um número maior ("123/45" não vale); o ano ("/2026") é opcional.
const DATA_NO_TEXTO_RE = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/\d{1,4})?(?!\d)/g;

const doisDigitos = (n: string): string => n.padStart(2, "0");

export function previsaoParaCard(texto: string | null | undefined): PrevisaoCard | null {
  const completo = typeof texto === "string" ? texto.trim() : "";
  if (!completo) return null;

  for (const achado of completo.matchAll(DATA_NO_TEXTO_RE)) {
    const dia = Number(achado[1]);
    const mes = Number(achado[2]);
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      return { curto: `${doisDigitos(achado[1]!)}/${doisDigitos(achado[2]!)}`, completo };
    }
  }
  return null;
}
