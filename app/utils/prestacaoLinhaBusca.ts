// Medidas únicas dos controles da 1ª linha de /prestacao em lg+: busca, chips de mês ("Todos" e meses),
// ☰ "Mais meses" e "+ Nova prestação" (prestacao.vue e MonthFilterBar.vue). Uma constante só para os seis não
// voltarem a divergir. Altura: 44px (antes 38,25 / 34 / 39,5px). Raio de borda: 8px (antes 6px nos cinco e 8px
// só no botão azul). Abaixo de lg nada disso é usado: a busca segue com o ícone de filtros (e o raio de sempre,
// rounded-md) e a barra de meses fica oculta.
//
// As classes são literais de propósito (o Tailwind só gera o que enxerga escrito por inteiro). O lg:rounded-lg
// vem junto do rounded-md base de cada elemento: o raio de 8px vale só em lg+.
//
// Com altura fixa o padding vertical sai (py-0): o texto do botão/chip é centralizado pelo próprio elemento e o
// do input pelo navegador. box-sizing é border-box (preflight), então a borda de 1px do chip NÃO selecionado e a
// transparente do selecionado têm a mesma altura total (e o mesmo raio).

export const LINHA_BUSCA_CONTROLE_CLASS = "lg:h-11 lg:py-0 lg:rounded-lg";

// ☰: quadrado 44x44.
export const LINHA_BUSCA_QUADRADO_CLASS = "lg:h-11 lg:w-11 lg:p-0 lg:rounded-lg";
