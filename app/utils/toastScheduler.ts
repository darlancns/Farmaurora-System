// Agenda os toasts: o comum dura 2,2 s e é substituído na hora pelo próximo; um aviso "protegido"
// (falha parcial, pendência no Word) dura mais e NÃO é sobrescrito — o que chegar enquanto ele está
// na tela entra numa fila curta e aparece quando ele sai. Puro (relógio e timers injetáveis) pra
// ser testado sem Nuxt; useToast.ts só liga isto ao useState.

export const TOAST_PADRAO_MS = 2200;
export const TOAST_AVISO_MS = 8000;
const FILA_MAXIMA = 5;

export interface ToastOptions {
  /** Aviso importante: dura TOAST_AVISO_MS e não é sobrescrito por outro toast. */
  protegido?: boolean;
  durationMs?: number;
}

interface Pendente {
  text: string;
  options: ToastOptions;
}

export interface ToastSchedulerDeps {
  setMessage: (text: string | null) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export function createToastScheduler(deps: ToastSchedulerDeps) {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));

  let timerId: unknown;
  let protegidoAte = 0;
  const fila: Pendente[] = [];

  function exibir(text: string, options: ToastOptions): void {
    const ms = options.durationMs ?? (options.protegido ? TOAST_AVISO_MS : TOAST_PADRAO_MS);
    deps.setMessage(text);
    if (timerId !== undefined) clearTimer(timerId);
    protegidoAte = options.protegido ? now() + ms : 0;
    timerId = setTimer(() => {
      timerId = undefined;
      protegidoAte = 0;
      deps.setMessage(null);
      const proximo = fila.shift();
      if (proximo) exibir(proximo.text, proximo.options);
    }, ms);
  }

  function show(text: string, options: ToastOptions = {}): void {
    if (now() < protegidoAte) {
      if (fila.length < FILA_MAXIMA) fila.push({ text, options });
      return;
    }
    exibir(text, options);
  }

  return { show };
}
