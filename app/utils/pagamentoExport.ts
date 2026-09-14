import type { EmpresaPagamento } from "#shared/types/Pagamento";

// País a partir do nome do fornecedor ("Poros - Turquia" → "TURQUIA").
// Usado só no estado "aguardando", onde mostramos apenas o país.
const FORNECEDOR_PAIS: Record<string, string> = {
  beldimed: "BÉLGICA",
  pharyx: "CHINA",
  poros: "TURQUIA",
  speciality: "ÍNDIA",
};

export function paisFornecedor(fornecedor: string): string | null {
  // Os 4 fornecedores fixos chegam como "Nome - País" e o nome não tem hífen,
  // então a parte antes do primeiro hífen basta para achá-los no mapa.
  const chave = fornecedor.split("-")[0]?.trim().toLowerCase() ?? "";
  const doMapa = FORNECEDOR_PAIS[chave];
  if (doMapa) return doMapa;

  // "Outro" é texto livre e o nome pode conter hífen ("Trans-Rápido - Turquia"),
  // então o país é o que vem depois do ÚLTIMO " - " (separador com espaços) —
  // partir no primeiro hífen devolveria "RÁPIDO".
  const corte = fornecedor.lastIndexOf(" - ");
  if (corte === -1) return null;
  const pais = fornecedor.slice(corte + 3).trim();
  return pais ? pais.toLocaleUpperCase("pt-BR") : null;
}

// Classe de fundo do cabeçalho por empresa. accent-dark (#0b3956) e mainz-gold
// (#a6791c) já existem como tokens no tema (app/assets/css/main.css).
export const EMPRESA_EXPORT_HEADER_CLASS: Record<EmpresaPagamento, string> = {
  FARMAURORA: "bg-accent-dark",
  MAINZFARMA: "bg-mainz-gold",
};

// Formata a data LOCAL (não UTC) como yyyy-mm-dd. dataExibicao carrega a hora
// real do clique — toISOString() converteria pra UTC antes de formatar, o que
// erra o dia perto da virada de meia-noite local (ex: 22h em Brasília já é
// dia seguinte em UTC).
export function formatarDataLocalISO(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function sanitizeNomeArquivo(txt: string): string {
  return txt
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export async function copiarImagemParaClipboard(blob: Blob): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

export function baixarBlob(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
