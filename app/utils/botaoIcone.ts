// Botão quadrado só de ícone com borda e cantos arredondados (o X, o lápis e o "Mover para…" da barra lateral do processo e
// o X do cabeçalho do formulário de processo): 44x44 abaixo de lg (alvo de toque) e 36x36 em lg+, borda hairline, raio 8,
// fundo branco, ícone no cinza do projeto. O ícone (16px, traço 1.75) vai dentro, com aria-hidden.
export const BOTAO_ICONE_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-hairline bg-paper-raised text-ink-soft transition-colors lg:h-9 lg:w-9";

// Hover do X (fechar): borda e ícone em vermelho. Os outros botões de ícone usam o hover de destaque (accent-dark).
export const BOTAO_FECHAR_HOVER_CLASS = "hover:border-danger hover:text-danger";
