// Altura única (44px) dos controles da 1ª linha de /prestacao em lg+: busca, chips de mês ("Todos" e meses),
// ☰ "Mais meses" e "+ Nova prestação" (prestacao.vue e MonthFilterBar.vue). Uma constante só para os seis não
// voltarem a divergir (antes: 38,25 / 34 / 39,5px). Abaixo de lg nada disso é usado: a busca segue com o ícone
// de filtros e a barra de meses fica oculta.
//
// As classes são literais de propósito (o Tailwind só gera o que enxerga escrito por inteiro).
//
// Com altura fixa o padding vertical sai (py-0): o texto do botão/chip é centralizado pelo próprio elemento e o
// do input pelo navegador. box-sizing é border-box (preflight), então a borda de 1px do chip NÃO selecionado e a
// transparente do selecionado têm a mesma altura total.

export const LINHA_BUSCA_ALTURA_CLASS = "lg:h-11 lg:py-0";

// ☰: quadrado 44x44.
export const LINHA_BUSCA_QUADRADO_CLASS = "lg:h-11 lg:w-11 lg:p-0";
