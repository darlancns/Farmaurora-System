export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function padTwoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

// Máscara progressiva "DD/MM/AAAA" pro campo `data` de Paciente. Mesma
// proteção de app/utils/processoFormatters.ts's maskDataDDMM: só mexe no
// valor enquanto ele for puramente numérico (0 a 4 dígitos) — ou seja, só
// enquanto o usuário está digitando a data do zero. Assim que o valor tiver
// uma "/" (a própria máscara já inseriu) ou qualquer caractere não numérico,
// devolve como veio, sem extrair dígitos nem truncar — nunca corrompe texto
// livre (ex.: uma anotação colada no lugar da data).
export function maskDateDdMm(rawValue: string): string {
  if (!/^\d{0,4}$/.test(rawValue)) return rawValue;
  if (rawValue.length <= 2) return rawValue;
  const day = rawValue.slice(0, 2);
  const month = rawValue.slice(2, 4);
  return rawValue.length === 4 ? `${day}/${month}/${new Date().getFullYear()}` : `${day}/${month}`;
}

const NAME_LOWERCASE_WORDS = new Set(["de", "da", "do", "das", "dos", "e"]);

export function toTitleCaseName(rawValue: string): string {
  return rawValue
    .split(" ")
    .map((word, index) => {
      if (!word) return word;
      const lower = word.toLocaleLowerCase("pt-BR");
      if (index > 0 && NAME_LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function normalizeCurrencyInput(rawValue: string): string {
  const cleaned = rawValue.replace(/[^0-9,.]/g, "");
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let integerPart: string;
  let decimalPart: string;

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastDot > lastComma) {
      integerPart = cleaned.slice(0, lastDot).replace(/,/g, "");
      decimalPart = cleaned.slice(lastDot + 1);
    } else {
      integerPart = cleaned.slice(0, lastComma).replace(/\./g, "");
      decimalPart = cleaned.slice(lastComma + 1);
    }
  } else if (hasDot) {
    const groups = cleaned.split(".");
    const lastGroup = groups[groups.length - 1] ?? "";
    if (groups.length > 1 && lastGroup.length === 3) {
      integerPart = groups.join("");
      decimalPart = "";
    } else {
      integerPart = groups.slice(0, -1).join("");
      decimalPart = lastGroup;
    }
  } else if (hasComma) {
    const groups = cleaned.split(",");
    integerPart = groups.slice(0, -1).join("");
    decimalPart = groups[groups.length - 1] ?? "";
  } else {
    integerPart = cleaned;
    decimalPart = "";
  }

  integerPart = integerPart.replace(/[^0-9]/g, "");
  decimalPart = decimalPart.replace(/[^0-9]/g, "").slice(0, 2);

  const groupedInteger = (integerPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return decimalPart ? `${groupedInteger},${decimalPart}` : groupedInteger;
}

export function maskCurrencyDigits(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, "");
  if (!digits) return "";

  const padded = digits.padStart(3, "0");
  const decimalPart = padded.slice(-2);
  const integerPart = padded.slice(0, -2).replace(/^0+(?=\d)/, "");

  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${groupedInteger},${decimalPart}`;
}

export function parseBrCurrency(displayValue: string): number {
  if (!displayValue) return 0;
  const normalized = displayValue.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Normaliza um valor monetário colado de uma proforma invoice (que pode chegar em
 * vários formatos internacionais) para o formato brasileiro fixo "nn.nnn,nn".
 *
 *   "$8,550.00"   -> "8.550,00"
 *   "9,210.00"    -> "9.210,00"
 *   "20.680,00"   -> "20.680,00"
 *   "$9,835"      -> "9.835,00"
 *   "US$2,780.00" -> "2.780,00"
 *
 * Regras (diferentes do normalizeCurrencyInput, que é pra digitação BR):
 *  - descarta tudo que não seja dígito, "." ou ",";
 *  - com "," e "." presentes, o que aparece por último é o separador decimal;
 *  - com só um tipo de separador, ele é decimal APENAS se aparecer uma única vez
 *    e o último grupo não tiver exatamente 3 dígitos (senão é separador de milhar);
 *  - a saída sempre tem 2 casas decimais.
 */
export function formatInvoiceAmountBR(rawValue: string): string {
  const cleaned = rawValue.replace(/[^0-9.,]/g, "");
  if (!/\d/.test(cleaned)) return "";

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let integerDigits: string;
  let decimalDigits: string;

  if (lastComma !== -1 && lastDot !== -1) {
    const sep = Math.max(lastComma, lastDot);
    integerDigits = cleaned.slice(0, sep);
    decimalDigits = cleaned.slice(sep + 1);
  } else {
    const sepChar = lastComma !== -1 ? "," : lastDot !== -1 ? "." : "";
    if (!sepChar) {
      integerDigits = cleaned;
      decimalDigits = "";
    } else {
      const sep = Math.max(lastComma, lastDot);
      const tail = cleaned.slice(sep + 1);
      const ocorrencias = cleaned.split(sepChar).length - 1;
      if (ocorrencias > 1 || tail.length === 3) {
        integerDigits = cleaned;
        decimalDigits = "";
      } else {
        integerDigits = cleaned.slice(0, sep);
        decimalDigits = tail;
      }
    }
  }

  integerDigits = integerDigits.replace(/\D/g, "").replace(/^0+(?=\d)/, "") || "0";
  decimalDigits = (decimalDigits.replace(/\D/g, "") + "00").slice(0, 2);

  const grouped = integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped},${decimalDigits}`;
}
