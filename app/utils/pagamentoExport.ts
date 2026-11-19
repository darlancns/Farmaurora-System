import type { EmpresaPagamento, ItemCadastroPagamento } from "#shared/types/Pagamento";
import { paisDoFornecedorNoCadastro } from "#shared/utils/pagamentoCadastro";

// País a partir do nome do fornecedor ("Poros - Turquia" → "TURQUIA").
// Usado só no estado "aguardando", onde mostramos apenas o país.
// Mapa de reserva: a fonte do país agora é o campo `pais` do Cadastro (ver paisFornecedor); este mapa só vale para o
// texto gravado que o Cadastro não reconhece. a remover na etapa 3.
const FORNECEDOR_PAIS: Record<string, string> = {
  beldimed: "BÉLGICA",
  pharyx: "CHINA",
  poros: "TURQUIA",
  speciality: "ÍNDIA",
};

export function paisFornecedor(fornecedor: string, cadastro: readonly ItemCadastroPagamento[] = []): string | null {
  // 1º o Cadastro: casa o texto gravado ("Nome - País", ou só o nome) com o fornecedor pelo nome sem o " - País"
  // (chaveCadastro) e devolve o `pais` dele. Sem fornecedor ou sem país lá, segue o comportamento de sempre.
  const doCadastro = paisDoFornecedorNoCadastro(cadastro, fornecedor);
  if (doCadastro) return doCadastro;

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

// Classe de fundo do cabeçalho por empresa (accent-dark, #0b3956, é um token do tema em
// app/assets/css/main.css).
export const EMPRESA_EXPORT_HEADER_CLASS: Record<EmpresaPagamento, string> = {
  FARMAURORA: "bg-accent-dark",
};

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
