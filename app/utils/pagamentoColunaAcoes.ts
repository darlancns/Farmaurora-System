// Coluna de ações dos blocos mobile de /pagamentos (abaixo de lg): UMA largura única pros cabeçalhos do lote e
// do grupo, os itens alinhados e os cards de 3 linhas, pra divisória vertical cair no MESMO x em todos eles.
// 49px = 48px de área de toque + 1px da divisória (border-l). Em lg+ a coluna dos cabeçalhos vira `contents`
// (sem caixa) e estas classes não têm efeito.
export const COLUNA_ACOES_CLASSES = "w-[49px] shrink-0 border-l border-hairline";
