import { ref, type Ref } from "vue";

// Substituto de "#app" (runtime do Nuxt) para specs que rodam num DOM de teste (happy-dom), onde o Vite
// exige que todo import resolva — no ambiente node, "#app" só aparecia sob vi.mock. Só o necessário.
// Specs que precisam de mais seguem usando vi.mock("#app", ...), que tem precedência.
export function defineNuxtPlugin<T>(plugin: T): T {
  return plugin;
}

// useState do Nuxt: um ref compartilhado por chave (o estado vive enquanto o módulo estiver carregado).
const estados = new Map<string, Ref<unknown>>();
export function useState<T>(chave: string, init?: () => T): Ref<T> {
  if (!estados.has(chave)) estados.set(chave, ref(init ? init() : undefined));
  return estados.get(chave) as Ref<T>;
}
