import type { Section } from "./rbac";

/**
 * Seções DESLIGADAS por configuração (hoje só a DIR, pela chave `runtimeConfig.public.dirHabilitada`).
 *
 * Uma seção desligada vale "nenhum" para TODOS os cargos, inclusive o administrador: some do menu, a página redireciona, a API
 * responde 404 e a página inicial a pula. O que decide é `nivelDaSecao` (permissoesPagina.ts), de onde `podeLer`, `podeEscrever`,
 * `paginaInicial`, o menu e o middleware de API partem.
 *
 * É um ESTADO DE MÓDULO porque essas funções são puras e compartilhadas entre servidor e navegador e não enxergam o runtimeConfig.
 * O PADRÃO É "TUDO LIGADO": quem não chama `definirSecoesDesligadas` (os testes, por exemplo) vê o comportamento de sempre. Quem aplica o
 * valor real são os plugins `app/plugins/secoesDesligadas.ts` (SSR e navegador) e `server/plugins/secoesDesligadas.ts` (rotas de API).
 */
let desligadas: ReadonlySet<Section> = new Set<Section>();

/** Define (substitui) as seções desligadas. Lista vazia = tudo ligado. */
export function definirSecoesDesligadas(secoes: readonly Section[]): void {
  desligadas = new Set(secoes);
}

/** A seção está desligada por configuração? */
export function secaoDesligada(secao: Section): boolean {
  return desligadas.has(secao);
}

/** Volta ao padrão (tudo ligado). Só os testes precisam. */
export function religarTodasAsSecoes(): void {
  desligadas = new Set<Section>();
}

/**
 * `runtimeConfig.public.dirHabilitada` → a DIR está ligada? Só `true` (ou o texto "true"/"1", caso o valor chegue como string do ambiente)
 * liga. Qualquer outra coisa — ausente, `false`, vazio, texto estranho — mantém DESLIGADA (falha fechada).
 */
export function dirHabilitadaNaConfig(valor: unknown): boolean {
  if (valor === true) return true;
  if (typeof valor !== "string") return false;
  const texto = valor.trim().toLowerCase();
  return texto === "true" || texto === "1";
}

/** As seções que a configuração pública manda desligar (a DIR, quando `dirHabilitada` não é verdadeira). */
export function secoesDesligadasPelaConfig(configPublica: object | null | undefined): Section[] {
  // `object` (e não `{ dirHabilitada?: unknown }`): o tipo gerado do runtimeConfig (.nuxt) só conhece a chave depois do `nuxt prepare`.
  const valor = (configPublica as { dirHabilitada?: unknown } | null | undefined)?.dirHabilitada;
  return dirHabilitadaNaConfig(valor) ? [] : ["dir"];
}
