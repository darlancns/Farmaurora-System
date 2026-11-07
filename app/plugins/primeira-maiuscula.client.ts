import { defineNuxtPlugin } from "#app";
import { instalarPrimeiraMaiuscula, rotaForaDaRegra } from "../utils/primeiraMaiuscula";

/**
 * Todo campo de texto começa com letra maiúscula (só a primeira letra; ver utils/primeiraMaiuscula.ts).
 * Um único listener global de "input" em captura no `document` — cobre v-model, `@input` e campos futuros
 * sem tocar em cada um. Campos que não podem ser alterados (códigos, chaves, senhas em type="text"...)
 * levam `data-sem-maiuscula`; tipos e atributos sensíveis são ignorados automaticamente.
 *
 * Só no cliente (precisa de `document`). A DIR fica de fora enquanto o trabalho dela estiver sem commit.
 */
export default defineNuxtPlugin(() => {
  instalarPrimeiraMaiuscula(document, {
    // TODO: remover esta guarda temporária depois que a DIR (/dir) for commitada.
    ignorar: () => rotaForaDaRegra(window.location.pathname),
  });
});
