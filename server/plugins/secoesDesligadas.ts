import { defineNitroPlugin, useRuntimeConfig } from "#imports";
import { definirSecoesDesligadas, secoesDesligadasPelaConfig } from "#shared/utils/secoesDesligadas";

// Aplica ao SERVIDOR (rotas de API) as seções desligadas pela configuração: hoje a DIR, que só liga com NUXT_PUBLIC_DIR_HABILITADA=true.
// Roda uma vez na partida do Nitro (na Vercel, a cada partida a frio da função), com o runtimeConfig já mesclado com o ambiente.
// O estado vive em shared/utils/secoesDesligadas.ts; o middleware server/middleware/auth.ts responde 404 em /api/dir* quando a DIR
// está desligada e `podeLer`/`podeEscrever` passam a negar a seção. Padrão sem esta chamada (ex.: testes): tudo ligado.
export default defineNitroPlugin(() => {
  definirSecoesDesligadas(secoesDesligadasPelaConfig(useRuntimeConfig().public));
});
