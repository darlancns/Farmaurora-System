// Substituto de "#app" (runtime do Nuxt) para specs que rodam num DOM de teste (happy-dom), onde o Vite
// exige que todo import resolva — no ambiente node, "#app" só aparecia sob vi.mock. Só o necessário.
// Specs que precisam de mais (ex.: useState) seguem usando vi.mock("#app", ...), que tem precedência.
export function defineNuxtPlugin<T>(plugin: T): T {
  return plugin;
}
