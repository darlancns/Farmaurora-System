import { isBrandMedicamento, LIMITE_LABORATORIO, ROTULOS_BRAND_MEDICAMENTO } from "../constants/processos";
import type { Medicamento } from "../types/processo";

// Laboratório e Brand do medicamento: regras puras usadas pelo formulário (ao digitar, no blur e no payload), pelo servidor
// (POST/PATCH), pelo mapeador (leitura tolerante) e pela exibição (painel e detalhe). Testes: tests/unit/laboratorio.spec.ts.

// ── Laboratório: UMA regra de capitalização, em duas variantes ─────────────────────────────────────────────────────
// Núcleo (capitalizarIniciais): a 1ª letra de cada palavra vira maiúscula (pt-BR) e TODO o resto fica exatamente como foi
// digitado — "EMS", "MSD", "GSK" continuam iguais (Caps Lock/Shift inclusive); "ems" vira "Ems". Começa palavra: o início do
// texto, depois de um espaço (qualquer branco) e depois de um hífen ("Bristol-Myers"). Apóstrofo e ponto não começam palavra
// ("s.a." → "S.a."; "S.A." fica "S.A."). O núcleo NUNCA muda o tamanho do texto (letra que cresceria, como "ß" → "SS",
// fica como está): por isso a posição do cursor continua válida ao aplicá-lo enquanto a pessoa digita.
//  (a) Ao digitar (input): só o núcleo — sem trim e sem juntar espaços (o espaço entre as palavras precisa poder ser digitado).
//  (b) Normalização completa (blur, payload e servidor): normalizarLaboratorio = trim + espaços repetidos viram um + até
//      LIMITE_LABORATORIO caracteres + o MESMO núcleo.
// NÃO é a regra do campo Paciente (toTitleCaseName), que põe o resto da palavra em minúsculas.

const INICIO_DE_PALAVRA = /(^|[\s-])([^\s-])/gu;

/** Variante (a): 1ª letra de cada palavra maiúscula, o resto intacto; mesmo tamanho. null/undefined/não texto → "". */
export function capitalizarIniciais(texto: string | null | undefined): string {
  if (typeof texto !== "string") return "";
  return texto.replace(INICIO_DE_PALAVRA, (_trecho, antes: string, letra: string) => {
    const maiuscula = letra.toLocaleUpperCase("pt-BR");
    return antes + (maiuscula.length === letra.length ? maiuscula : letra);
  });
}

// Pontas sem espaço e brancos repetidos (tab, quebra de linha, espaço duro...) viram um espaço.
function juntarEspacos(texto: string | null | undefined): string {
  return typeof texto === "string" ? texto.trim().replace(/\s+/gu, " ") : "";
}

/**
 * Tamanho que o texto terá depois de juntar os espaços (antes de qualquer corte). É o que o servidor e o formulário
 * conferem contra LIMITE_LABORATORIO: acima disso o texto é recusado (400 / mensagem), nunca cortado sem aviso.
 */
export function tamanhoLaboratorio(texto: string | null | undefined): number {
  return juntarEspacos(texto).length;
}

/**
 * Variante (b), normalização completa: trim, espaços repetidos viram um, no máximo LIMITE_LABORATORIO caracteres e o
 * núcleo de capitalização. "  teuto    brasileiro " → "Teuto Brasileiro". null/undefined → "".
 */
export function normalizarLaboratorio(texto: string | null | undefined): string {
  let limpo = juntarEspacos(texto);
  if (limpo.length > LIMITE_LABORATORIO) {
    limpo = limpo.slice(0, LIMITE_LABORATORIO);
    const ultimo = limpo.charCodeAt(limpo.length - 1);
    if (ultimo >= 0xd800 && ultimo <= 0xdbff) limpo = limpo.slice(0, -1); // não corta um caractere ao meio
    limpo = limpo.trimEnd();
  }
  return capitalizarIniciais(limpo);
}

/**
 * Leitura tolerante de um item gravado: item antigo sem `laboratorio`/`brand` (ou com null, ou com um valor que não é
 * do tipo) volta com "". As outras chaves (dosagem, qualquer outra) ficam como estão. Não normaliza o texto.
 */
export function lerMedicamento(item: Partial<Medicamento> & Record<string, unknown>): Medicamento {
  return {
    ...item,
    nome: typeof item.nome === "string" ? item.nome : "",
    laboratorio: typeof item.laboratorio === "string" ? item.laboratorio : "",
    brand: isBrandMedicamento(item.brand) ? item.brand : "",
  };
}

/** "Laboratório · Brand" só com as partes preenchidas; nenhuma das duas = "" (sem "·" sobrando). */
export function linhaLaboratorioBrand(item: Pick<Partial<Medicamento>, "laboratorio" | "brand">): string {
  const laboratorio = typeof item.laboratorio === "string" ? item.laboratorio.trim() : "";
  const brand = isBrandMedicamento(item.brand) ? ROTULOS_BRAND_MEDICAMENTO[item.brand] : "";
  return [laboratorio, brand].filter(Boolean).join(" · ");
}
