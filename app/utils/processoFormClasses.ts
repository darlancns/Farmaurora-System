// Classes dos campos do formulário de processo (ProcessoFormModal.vue e filhos).
//
// Abaixo de lg o modal é tela cheia (celular/tablet): campos com 44px de altura
// e 16px de fonte (evita o zoom automático do iOS ao focar). Em lg+ cada classe
// de lg: devolve exatamente o tamanho de antes — o desktop não muda. Os
// text-[Npx] são arbitrários de propósito (só mexem em font-size; text-base
// também trocaria o line-height e quebraria a restauração em lg).

const CAMPO_BASE =
  "w-full min-h-11 rounded-md border border-hairline bg-paper px-2.5 py-2 focus:bg-white focus:outline-2 focus:outline-accent-dark lg:min-h-auto";

export const INPUT_CLASS = `${CAMPO_BASE} text-[16px] lg:text-[13.5px]`;
export const INPUT_MONO_CLASS = `${CAMPO_BASE} font-mono text-[16px] lg:text-[13.5px]`;
// Medicamentos e pendências (13px no desktop).
export const INPUT_COMPACTO_CLASS = `${CAMPO_BASE} text-[16px] lg:text-[13px]`;
// Datas DD/MM (mono 12.5px no desktop).
export const INPUT_DATA_CLASS = `${CAMPO_BASE} font-mono text-[16px] lg:text-[12.5px]`;

export const LABEL_CLASS = "mb-1.5 block text-[12px] text-ink-soft lg:text-[10.5px]";

// Vai no <div> que envolve label + AppSelect: o AppSelect é compartilhado com
// outras telas e não aceita classe no botão nem na lista, então o ajuste entra
// por seletor descendente a partir daqui (AppSelect.vue fica intacto).
//
// Abaixo de lg: botão de 44px/16px, opções de ~44px e a lista aberta vira um
// painel fixo logo acima do rodapé, sempre inteiro dentro da viewport — numa
// lista absoluta dentro do corpo rolável ela seria cortada pelo rodapé/pela
// borda da tela conforme a posição do campo. Em lg+ tudo volta ao de antes
// (lista absoluta, w-max, max-w 20rem, max-h-56).
export const SELECT_CAMPO_CLASS = [
  "[&_button]:min-h-11 [&_button]:text-[16px] [&_li]:py-3",
  "[&_ul]:fixed [&_ul]:right-4 [&_ul]:bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] [&_ul]:left-4 [&_ul]:mt-0 [&_ul]:max-h-[min(24rem,55dvh)] [&_ul]:w-auto [&_ul]:max-w-none [&_ul]:min-w-0",
  "sm:[&_ul]:right-[max(1rem,calc((100%-720px)/2+1.25rem))] sm:[&_ul]:left-[max(1rem,calc((100%-720px)/2+1.25rem))]",
  "lg:[&_button]:min-h-auto lg:[&_button]:text-[13.5px] lg:[&_li]:py-2",
  "lg:[&_ul]:absolute lg:[&_ul]:right-auto lg:[&_ul]:bottom-auto lg:[&_ul]:left-auto lg:[&_ul]:mt-1 lg:[&_ul]:max-h-56 lg:[&_ul]:w-max lg:[&_ul]:max-w-[min(20rem,90vw)] lg:[&_ul]:min-w-full",
].join(" ");

// Botão "✕" de remover item (medicamento/pendência). Mantém o ajuste de toque
// da Rodada 7 (px-4 py-2.5, md:px-1.5 md:py-2) e garante 44x44 abaixo de lg —
// inclusive no tablet, onde o md: encolheria o alvo.
export const BOTAO_REMOVER_CLASS =
  "flex min-h-11 min-w-11 items-center justify-center rounded-md px-4 py-2.5 text-ink-soft transition-colors hover:text-danger md:px-1.5 md:py-2 lg:block lg:min-h-auto lg:min-w-auto";

// Margem lateral do casco em tela cheia: 16px no celular e, no tablet, o
// conteúdo fica numa coluna de no máximo 720px (a mesma largura do modal no
// desktop) centralizada — senão os campos esticariam por 1000px.
export const MODAL_PAD_X_CLASS = "px-4 sm:px-[max(1rem,calc((100%-720px)/2+1.25rem))]";
