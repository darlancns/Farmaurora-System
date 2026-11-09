// Separa a companhia aérea do número no texto antigo do AWB da DIR ("Lufthansa: 020-01045494" → cia "Lufthansa", AWB
// "020-01045494"). Função PURA e sem imports (o script de dados e o navegador carregam este arquivo direto).
//
// Usada SÓ pelo parser da carga (shared/utils/dirParser.ts), que a aplica ao AWB da planilha; nenhum fluxo da aplicação
// (servidor, formulário) a chama. Os nomes devolvidos são os da lista de companhias do Follow-Up (shared/constants/processos.ts).

export interface CiaAwbSeparados {
  /** Nome da companhia como na lista (ex.: "Lufthansa"), ou null quando o texto não começa por uma companhia conhecida. */
  cia: string | null;
  /** O número como escrito (espaços e hífens preservados). Sem companhia reconhecida: o texto original, intacto. */
  awb: string;
}

// Chave: nome escrito, sem acento, em minúsculas, espaços colapsados e sem pontuação nas pontas.
const CIAS_POR_NOME: Readonly<Record<string, string>> = {
  lufthansa: "Lufthansa",
  emirates: "Emirates",
  emiurates: "Emirates", // erro de digitação que existe nos dados
  swiss: "Swiss",
  turkish: "Turkish",
  "turkish cargo": "Turkish",
  "turkish airline": "Turkish",
  qatar: "Qatar",
  dhl: "DHL",
  "dhl formal": "DHL",
  fedex: "FedEx",
  "fedex formal": "FedEx",
  "fedex courier": "FedEx",
};

function chaveDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ") // ":" "-" "." e afins entre o nome e o número
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Aceita "Cia: número", "Cia número" e "Cia - número", com variações de caixa, espaços e a grafia dos nomes do mapa
 * (inclui "Emiurates"). O nome é tudo o que vem antes do primeiro dígito; o número é o resto, aparado nas pontas.
 *
 * Sem companhia reconhecida (ex.: "23/out.", "FALECIMENTO", vazio, texto que começa pelo número) volta
 * `{ cia: null, awb: <texto original, intacto> }`. Só o nome da companhia, sem número ("Lufthansa"), volta com a cia e AWB "".
 */
export function separarCiaAwb(texto: string): CiaAwbSeparados {
  const original = typeof texto === "string" ? texto : "";
  const primeiroDigito = original.search(/\d/);
  const nome = primeiroDigito === -1 ? original : original.slice(0, primeiroDigito);
  const cia = CIAS_POR_NOME[chaveDoNome(nome)];
  if (!cia) return { cia: null, awb: original };
  return { cia, awb: primeiroDigito === -1 ? "" : original.slice(primeiroDigito).trim() };
}
