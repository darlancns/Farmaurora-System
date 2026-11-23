import { defineNuxtPlugin, useRuntimeConfig } from "#app";
import { definirSecoesDesligadas, secoesDesligadasPelaConfig } from "#shared/utils/secoesDesligadas";

/**
 * Aplica a chave `runtimeConfig.public.dirHabilitada` ao app (SSR e navegador): sem NUXT_PUBLIC_DIR_HABILITADA=true a DIR fica DESLIGADA —
 * some do menu (barra lateral, barra de baixo e "Mais"), /dir redireciona para a página inicial da pessoa, a linha "DIR" some da tela de
 * permissões e os textos que citam a DIR (Compras, Cadastros) são omitidos. O estado vive em shared/utils/secoesDesligadas.ts; quem decide
 * é `nivelDaSecao` (shared/utils/permissoesPagina.ts). O servidor tem o plugin gêmeo em server/plugins/secoesDesligadas.ts.
 *
 * Roda antes do render e dos middlewares de rota. No navegador o valor vem do payload do SSR (o mesmo do servidor), então SSR e
 * hidratação enxergam a mesma chave.
 */
export default defineNuxtPlugin(() => {
  definirSecoesDesligadas(secoesDesligadasPelaConfig(useRuntimeConfig().public));
});
