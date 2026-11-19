import type { Cadastro, Despachante, Fornecedor, ListaCadastro, MedicamentoCadastro } from "#shared/types/Cadastro";
import { CADASTRO_TAMANHO_PAGINA } from "#shared/constants/cadastros";
import { chaveCadastro } from "#shared/utils/cadastroNome";

// Colunas, contagem, busca e linha de resumo de cada lista na aba Cadastros. Funções PURAS (testadas em
// tests/unit/cadastroColunas.spec.ts); os componentes só desenham o resultado.
//
// A chave PIX (dado financeiro) NUNCA é mostrada aqui: a coluna PIX diz só "Cadastrada" ou "—", e só existe para quem
// recebe o campo (`podeVerPix`, a mesma regra do servidor: shared/utils/cadastroPix.ts).

export interface ColunaCadastro {
  chave: string;
  titulo: string;
  /** Texto da célula; "—" quando vazio. */
  texto: (item: Cadastro) => string;
}

const VAZIO = "—";

const ou = (valor: string): string => (valor.trim() === "" ? VAZIO : valor);

/** Alerta do fornecedor: "Sem alerta" ou "N dia(s)". */
export function textoAlerta(f: Pick<Fornecedor, "semAlerta" | "prazoAlertaDias">): string {
  if (f.semAlerta) return "Sem alerta";
  if (f.prazoAlertaDias === null) return VAZIO;
  return f.prazoAlertaDias === 1 ? "1 dia" : `${f.prazoAlertaDias} dias`;
}

/** O item tem chave PIX cadastrada? (O campo só existe para quem pode ver; ausente = não sabemos, vale "não".) */
export function temPix(item: Cadastro): boolean {
  const chave = (item as { chavePix?: string }).chavePix;
  return typeof chave === "string" && chave.trim() !== "";
}

/** Coluna PIX: "Cadastrada" ou "—". Nunca a chave. */
export function textoPix(item: Cadastro): string {
  return temPix(item) ? "Cadastrada" : VAZIO;
}

const COLUNA_PIX: ColunaCadastro = { chave: "pix", titulo: "PIX", texto: textoPix };

/**
 * Colunas da lista ALÉM de Nome e Ativo (que são sempre as primeiras e a última).
 * Fornecedores: País, Prazo de alerta. Despachantes: Contato, Telefone, E-mail, PIX. Transportadoras: PIX.
 * Medicamentos: Temperatura. Cias aéreas, consultores e temperaturas: nenhuma. A coluna PIX só entra com `podeVerPix`.
 */
export function colunasDaLista(lista: ListaCadastro, podeVerPix = false): ColunaCadastro[] {
  switch (lista) {
    case "fornecedores":
      return [
        { chave: "pais", titulo: "País", texto: (i) => ou((i as Fornecedor).pais) },
        { chave: "alerta", titulo: "Prazo de alerta", texto: (i) => textoAlerta(i as Fornecedor) },
      ];
    case "despachantes":
      return [
        { chave: "contato", titulo: "Contato", texto: (i) => ou((i as Despachante).contatoNome) },
        { chave: "telefone", titulo: "Telefone", texto: (i) => ou((i as Despachante).telefone) },
        { chave: "email", titulo: "E-mail", texto: (i) => ou((i as Despachante).email) },
        ...(podeVerPix ? [COLUNA_PIX] : []),
      ];
    case "transportadoras":
      return podeVerPix ? [COLUNA_PIX] : [];
    case "medicamentos":
      return [{ chave: "temperatura", titulo: "Temperatura", texto: (i) => ou((i as MedicamentoCadastro).temperatura) }];
    default:
      return [];
  }
}

/**
 * Segunda linha do item no celular (a primeira é o nome): fornecedor = "país · prazo"; despachante = contato (e
 * "PIX cadastrada" quando houver); transportadora = "PIX cadastrada"; medicamento = a temperatura. Só as partes que existem; "" quando
 * não há nada.
 */
export function linhaSecundaria(lista: ListaCadastro, item: Cadastro, podeVerPix = false): string {
  const partes: string[] = [];
  if (lista === "fornecedores") {
    const f = item as Fornecedor;
    if (f.pais.trim() !== "") partes.push(f.pais);
    partes.push(textoAlerta(f));
  } else if (lista === "despachantes") {
    const contato = (item as Despachante).contatoNome.trim();
    if (contato !== "") partes.push(contato);
    if (podeVerPix && temPix(item)) partes.push("PIX cadastrada");
  } else if (lista === "transportadoras") {
    if (podeVerPix && temPix(item)) partes.push("PIX cadastrada");
  } else if (lista === "medicamentos") {
    const temperatura = (item as MedicamentoCadastro).temperatura.trim();
    if (temperatura !== "") partes.push(temperatura);
  }
  return partes.join(" · ");
}

/** "13 · 13 ativos" (total · ativos); "1 · 1 ativo". */
export function textoContagem(itens: readonly Pick<Cadastro, "ativo">[]): string {
  const ativos = itens.filter((i) => i.ativo).length;
  return `${itens.length} · ${ativos} ${ativos === 1 ? "ativo" : "ativos"}`;
}

/** Com busca ativa: "2 encontrados" (ou "1 encontrado", "0 encontrados"). */
export function textoEncontrados(quantidade: number): string {
  return `${quantidade} ${quantidade === 1 ? "encontrado" : "encontrados"}`;
}

/**
 * "Mostrar mais": os primeiros `limite` itens e quantos ainda faltam. Os ids e a ordem vêm da lista recebida (ativos primeiro, depois
 * inativos). `limite` menor que 1 mostra a primeira página.
 */
export function paginaDaLista<T>(itens: readonly T[], limite: number, tamanhoPagina = CADASTRO_TAMANHO_PAGINA): { itens: T[]; restantes: number } {
  const teto = Math.max(limite, tamanhoPagina);
  return { itens: itens.slice(0, teto), restantes: Math.max(0, itens.length - teto) };
}

/** Texto do botão "Mostrar mais": "Mostrar mais (50 de 364)" — quantos vêm agora de quantos faltam (o molde da DIR). */
export function textoMostrarMais(restantes: number, tamanhoPagina = CADASTRO_TAMANHO_PAGINA): string {
  return `Mostrar mais (${Math.min(tamanhoPagina, restantes)} de ${restantes})`;
}

/**
 * O menor `limite` (múltiplo da página) que mostra o item na posição `indice` da lista; o `limite` atual se ele já cabe. Usado depois
 * de criar, renomear ou reativar: o item pode cair além da primeira página (ordem alfabética) e a pessoa precisa vê-lo.
 */
export function limiteParaMostrar(indice: number, limiteAtual: number, tamanhoPagina = CADASTRO_TAMANHO_PAGINA): number {
  if (indice < 0) return limiteAtual;
  return Math.max(limiteAtual, Math.ceil((indice + 1) / tamanhoPagina) * tamanhoPagina);
}

/**
 * Busca por nome: sem acento, sem diferença de caixa e com espaços repetidos colapsados (a mesma chaveCadastro do
 * servidor). Termo vazio devolve tudo. Mantém a ordem recebida (ativos primeiro, depois inativos).
 */
export function filtrarPorNome<T extends { nome: string }>(itens: readonly T[], termo: string): T[] {
  const chave = chaveCadastro(termo);
  if (chave === "") return [...itens];
  return itens.filter((i) => chaveCadastro(i.nome).includes(chave));
}
