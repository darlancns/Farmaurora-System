// As ABAS da página Compras abaixo de lg (celular e tela estreita): um painel por vez. No desktop (lg+) as três colunas aparecem juntas
// e a aba é ignorada. A aba escolhida vai na URL (?aba=lista|formulario|resumo).

export const ABAS_COMPRAS = ["lista", "formulario", "resumo"] as const;
export type AbaCompras = (typeof ABAS_COMPRAS)[number];

export const ROTULO_ABA_COMPRAS: Record<AbaCompras, string> = {
  lista: "Compras",
  formulario: "Formulário",
  resumo: "Resumo",
};

export type ColunaCompras = "esquerda" | "central" | "direita";

/** Qual aba mostra cada coluna: a lista (esquerda), o formulário (centro) e o resumo (direita). */
export const ABA_DA_COLUNA: Record<ColunaCompras, AbaCompras> = {
  esquerda: "lista",
  central: "formulario",
  direita: "resumo",
};

export function abaValida(valor: unknown): valor is AbaCompras {
  return typeof valor === "string" && (ABAS_COMPRAS as readonly string[]).includes(valor);
}

/**
 * A classe que esconde a coluna que NÃO é a da aba, só abaixo de lg (`max-lg:hidden`); em lg+ todas aparecem. É CSS puro: não depende de
 * medir a janela, então o HTML do servidor e o do navegador batem.
 */
export function classeDaColuna(coluna: ColunaCompras, aba: AbaCompras): string {
  return ABA_DA_COLUNA[coluna] === aba ? "" : "max-lg:hidden";
}

/** A aba de partida: a da URL; sem ela, "formulario" se já há uma compra aberta pela URL e "lista" nos outros casos. */
export function abaInicial(daUrl: AbaCompras | null, temCompra: boolean): AbaCompras {
  return daUrl ?? (temCompra ? "formulario" : "lista");
}
