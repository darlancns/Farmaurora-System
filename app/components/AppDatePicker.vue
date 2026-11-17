<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { formatarDataBR, hojeBrasilia, parseDataISO, somarDiasISO } from "#shared/utils/dataBrasilia";
import {
  interpretarDataDigitada,
  mascararDataDigitada,
  type SentidoAno,
} from "#shared/utils/anoAutomatico";
import { adquirirTravaDeScroll } from "../composables/useLockBodyScroll";
import { useBloqueioDatas } from "../composables/useBloqueioDatas";
import {
  DIAS_DA_SEMANA,
  MESES,
  MESES_ABREVIADOS,
  capitalizar,
  dentroDoIntervalo,
  diaDaSemana,
  diasNoMes,
  formatarEscolha,
  gradeDoMes,
  interpretarValor,
  limitarAoIntervalo,
  mesForaDoIntervalo,
  paraISO,
  rotuloDoDia,
  somarAnos,
  somarMeses,
  textoParaExibir,
  tituloDoMes,
  type FormatoData,
} from "../utils/calendario";

// Calendário próprio do sistema (nunca o calendário nativo do navegador). O campo NÃO é digitável: é um botão
// que mostra o valor e abre o calendário (desktop: popover ancorado ao campo; abaixo de lg: bottom sheet,
// como os demais sheets do app). Lógica de datas em utils/calendario.ts.
//
// - formato "dd/mm" (Processo): grava "DD/MM" para dias do ano corrente (de Brasília) e "DD/MM/AAAA" para
//   outro ano. formato "iso" (Pagamentos): grava "AAAA-MM-DD". `min`/`max` são datas ISO, inclusivas.
// - VALOR ANTIGO que não é uma data limpa (ex.: "09/10 - agd. análise", "já tem"): o campo o mostra exatamente
//   como está, com um pontinho de atenção (e tooltip "Texto antigo (não é uma data)"). Se ele começa com uma data
//   DD/MM, o calendário abre nela. Escolher uma data
//   (ou "Hoje") e "Limpar" NÃO substituem em silêncio: o painel mostra uma confirmação ("Isto substitui o texto
//   antigo: «…»", Confirmar / Cancelar) e só aplica depois do Confirmar.
// - O painel vai num <Teleport to="body"> com posição fixa (calculada a partir do campo): nenhum modal com
//   rolagem o corta. Esc fecha SÓ o calendário (não propaga para o modal) e devolve o foco ao campo.
//
// ANO AUTOMÁTICO (opt-in: `anoAutomatico`, com `sentido`; sem a prop, nada acima muda): o campo vira um <input>
// DIGITÁVEL (inputmode numérico, máscara DD/MM/AAAA) com um botão de limpar (enquanto o campo tem foco e texto) e
// um botão que abre o MESMO calendário. Ao sair do campo (ou Enter), "22/10" ou "2210" ganham o ano sozinhos
// (shared/utils/anoAutomatico.ts, "hoje" de Brasília); o ano digitado é respeitado. Data que não existe (31/04) ou
// incompleta fica como foi digitada, com um aviso discreto, e NÃO é emitida (o valor anterior continua).
// Valores novos (digitados ou escolhidos) saem SEMPRE com o ano: "DD/MM/AAAA" (formato "iso": "AAAA-MM-DD").
// Valor antigo "DD/MM" aparece como está até ser editado. Texto antigo com anotação continua no modo botão de
// cima (mostrado como está, substituição só com confirmação); depois de trocado ou limpo, o campo vira digitável.

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    formato?: FormatoData;
    min?: string;
    max?: string;
    placeholder?: string;
    id?: string;
    label?: string;
    disabled?: boolean;
    // Classes do campo (caixa, fonte). Sem ela, o mesmo visual do AppSelect.
    classeCampo?: string;
    // Opt-in: campo digitável com ano automático (ver o topo). `sentido`: "futuro" (prazos) ou "proximo" (fatos).
    anoAutomatico?: boolean;
    sentido?: SentidoAno;
  }>(),
  {
    anoAutomatico: false,
    sentido: "proximo",
    modelValue: "",
    formato: "dd/mm",
    min: undefined,
    max: undefined,
    placeholder: "Escolher data",
    id: "app-date-picker",
    label: undefined,
    disabled: false,
    classeCampo: undefined,
  },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const CAMPO_PADRAO =
  "rounded-md border border-hairline bg-paper px-2.5 py-2 text-[13.5px] focus:bg-white focus:outline-2 focus:outline-accent-dark";
// Popover do desktop (lg ou mais): COMPACTO — 17rem de largura (w-68), dias de 34px. A posição usa a largura e
// a altura MEDIDAS do painel; estes valores só valem antes da primeira medida.
const LARGURA_POPOVER = 272;
const ALTURA_POPOVER = 320;
const MARGEM = 8;

type Visao = "dias" | "meses" | "anos";
type Pendente = { tipo: "escolher"; iso: string } | { tipo: "limpar" } | null;

const aberto = ref(false);
const modo = ref<"popover" | "sheet">("popover");
const visao = ref<Visao>("dias");
const visivel = ref({ ano: 2026, mes: 1 });
const foco = ref("");
const inicioAnos = ref(0);
const pendente = ref<Pendente>(null);
const hojeIso = ref(hojeBrasilia());
const posicao = ref({ top: "0px", left: "0px" });
// Lado do popover (decidido UMA vez, ao abrir, com a visão de dias): trocar de visão ou aparecer a confirmação
// muda a altura do painel, mas ele não pula de cima para baixo.
const lado = ref<"abaixo" | "acima">("abaixo");

const botao = ref<HTMLButtonElement | null>(null);
const painel = ref<HTMLElement | null>(null);
// Modo digitável (anoAutomatico): a caixa (âncora do popover) e o <input>.
const caixa = ref<HTMLElement | null>(null);
const entrada = ref<HTMLInputElement | null>(null);

const painelId = computed(() => `${props.id}-calendario`);
const lido = computed(() => interpretarValor(props.modelValue ?? "", props.formato, hojeIso.value));
const textoAntigo = computed(() => (lido.value.tipo === "texto" ? lido.value.texto : ""));
const exibido = computed(() => textoParaExibir(props.modelValue ?? "", props.formato, hojeIso.value));
// Dia destacado como "selecionado": a data do valor, ou a que o texto antigo traz no início. Um valor antigo
// "DD/MM" (sem ano) é lido no ano corrente, como em todos os leitores (listas, alertas): o sentido do ano automático
// só vale para o que for DIGITADO agora, para o calendário nunca abrir num ano diferente do que as telas mostram.
const selecionado = computed(() => {
  if (lido.value.tipo === "data") return lido.value.iso;
  if (lido.value.tipo === "texto") return lido.value.isoInicial ?? "";
  return "";
});

// ── modo digitável (anoAutomatico) ──────────────────────────────────────────────────────────────────
// Texto antigo com anotação continua no modo botão (não dá para representá-lo num campo com máscara).
const digitavel = computed(() => props.anoAutomatico && !textoAntigo.value);
const rascunho = ref(exibido.value);
const textoNoFoco = ref("");
const comFoco = ref(false);
const erro = ref<"" | "incompleta" | "inexistente" | "fora">("");
const erroId = computed(() => `${props.id}-erro`);
const mensagemErro = computed(() => {
  if (erro.value === "inexistente") return "Data inexistente";
  if (erro.value === "incompleta") return "Data incompleta";
  // "fora": a data existe, mas está fora de min/max (ex.: "chegou? → adiar" só aceita a partir de amanhã).
  if (props.min) return `Use a partir de ${formatarDataBR(props.min)}`;
  return props.max ? `Use até ${formatarDataBR(props.max)}` : "Data fora do permitido";
});

// Bloqueio do Salvar (formulário com useProverBloqueioDatas): com erro, o envio não passa e o campo mostra
// "Corrija ou limpe a data". Corrigir ou limpar tira o erro, e o aviso some junto.
const avisoBloqueio = ref(false);
const bloqueio = props.anoAutomatico ? useBloqueioDatas() : null;
const sairDoBloqueio = bloqueio?.registrar({
  temErro: () => digitavel.value && erro.value !== "",
  avisarBloqueio: () => {
    avisoBloqueio.value = true;
  },
  focar: () => entrada.value?.focus(),
  elemento: () => caixa.value,
});
watch(erro, (atual) => {
  if (!atual) avisoBloqueio.value = false;
});

// O valor gravado manda: mudou por fora (calendário, outro campo, recarga), o texto do campo acompanha.
watch(
  () => props.modelValue,
  () => {
    rascunho.value = exibido.value;
    erro.value = "";
  },
);

/** Valor a gravar para um dia escolhido/digitado. Com ano automático, sempre com o ano. */
function valorParaGravar(iso: string): string {
  if (props.anoAutomatico) return props.formato === "iso" ? iso : formatarDataBR(iso);
  return formatarEscolha(iso, props.formato, hojeIso.value);
}

function aoDigitar(evento: Event): void {
  const alvo = evento.target as HTMLInputElement;
  const mascarado = mascararDataDigitada(alvo.value);
  rascunho.value = mascarado;
  if (alvo.value !== mascarado) alvo.value = mascarado;
  erro.value = "";
}

/** Fecha a digitação: interpreta o texto e emite (ou mostra o aviso). Devolve false quando o texto é inválido. */
function confirmarDigitado(): boolean {
  if (rascunho.value === textoNoFoco.value && !erro.value) return true; // nada mudou: o valor antigo fica intacto
  const r = interpretarDataDigitada(rascunho.value, hojeBrasilia(), props.sentido);
  if (r.tipo === "invalido") {
    erro.value = r.motivo;
    return false;
  }
  if (r.tipo === "data" && !dentroDoIntervalo(r.iso, props.min, props.max)) {
    erro.value = "fora";
    return false;
  }
  erro.value = "";
  const novo = r.tipo === "vazio" ? "" : valorParaGravar(r.iso);
  rascunho.value = novo === "" ? "" : textoParaExibir(novo, props.formato, hojeIso.value);
  textoNoFoco.value = rascunho.value;
  if (novo !== (props.modelValue ?? "")) emit("update:modelValue", novo);
  return true;
}

function aoFocar(): void {
  comFoco.value = true;
  textoNoFoco.value = rascunho.value;
}

function aoSair(): void {
  comFoco.value = false;
  confirmarDigitado();
}

function aoTeclarNaEntrada(evento: KeyboardEvent): void {
  if (evento.key === "Enter") {
    // Válido: deixa o Enter seguir (o formulário pode enviar, já com o valor novo; se OUTRO campo de data estiver
    // com erro, o bloqueio do formulário segura). Inválido: segura o envio e mostra o mesmo aviso do Salvar.
    if (!confirmarDigitado()) {
      evento.preventDefault();
      avisoBloqueio.value = true;
    }
    return;
  }
  if (evento.key === "ArrowDown" && evento.altKey) {
    evento.preventDefault();
    abrir();
  }
}

function aoColar(evento: ClipboardEvent): void {
  const colado = evento.clipboardData?.getData("text") ?? "";
  const iso = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(colado);
  if (!iso) return; // o resto passa pela máscara em aoDigitar
  evento.preventDefault();
  rascunho.value = `${iso[3]}/${iso[2]}/${iso[1]}`;
  erro.value = "";
}

function limparDigitado(): void {
  rascunho.value = "";
  textoNoFoco.value = "";
  erro.value = "";
  if (props.modelValue) emit("update:modelValue", "");
  entrada.value?.focus();
}
const vazio = computed(() => lido.value.tipo === "vazio");
const rotuloDoPainel = computed(() => props.label ?? "Escolher data");
const rotuloDoBotao = computed(() => {
  if (!props.label) return undefined;
  const situacao = textoAntigo.value
    ? `${exibido.value} (texto antigo)`
    : exibido.value || "nenhuma data escolhida";
  return `${props.label}: ${situacao}`;
});
const tituloDoBotao = computed(() =>
  textoAntigo.value ? `Texto antigo: ${textoAntigo.value}. Escolha uma data para substituir.` : undefined,
);

const grade = computed(() => gradeDoMes(visivel.value.ano, visivel.value.mes));
const tituloMes = computed(() => tituloDoMes(visivel.value.ano, visivel.value.mes));
const anosVisiveis = computed(() => Array.from({ length: 12 }, (_, i) => inicioAnos.value + i));
const hojeNoIntervalo = computed(() => dentroDoIntervalo(hojeIso.value, props.min, props.max));
const mesAnteriorBloqueado = computed(() => {
  const anterior = parseDataISO(somarMeses(paraISO(visivel.value.ano, visivel.value.mes, 1), -1));
  return !anterior || mesForaDoIntervalo(anterior.ano, anterior.mes, props.min, props.max);
});
const proximoMesBloqueado = computed(() => {
  const proximo = parseDataISO(somarMeses(paraISO(visivel.value.ano, visivel.value.mes, 1), 1));
  return !proximo || mesForaDoIntervalo(proximo.ano, proximo.mes, props.min, props.max);
});

const ehSheet = computed(() => modo.value === "sheet");
const classeBotao = computed(() => [
  "flex w-full items-center justify-between gap-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
  props.classeCampo ?? CAMPO_PADRAO,
  textoAntigo.value ? "border-dashed" : "",
]);

// ── abrir / fechar ──────────────────────────────────────────────────────────────────────────────────

function mirarNoDia(iso: string): void {
  const d = parseDataISO(iso);
  if (!d) return;
  visivel.value = { ano: d.ano, mes: d.mes };
  foco.value = iso;
}

function abrir(): void {
  if (props.disabled || aberto.value) return;
  hojeIso.value = hojeBrasilia();
  modo.value = window.matchMedia("(max-width: 1023px)").matches ? "sheet" : "popover";
  mirarNoDia(limitarAoIntervalo(selecionado.value || hojeIso.value, props.min, props.max));
  visao.value = "dias";
  pendente.value = null;
  aberto.value = true;
  void nextTick(() => {
    posicionar(true);
    focarNoDia();
  });
}

function fechar(devolverFoco = true): void {
  if (!aberto.value) return;
  aberto.value = false;
  pendente.value = null;
  if (devolverFoco) void nextTick(() => (digitavel.value ? entrada.value : botao.value)?.focus());
}

function alternar(): void {
  if (aberto.value) fechar();
  else abrir();
}

function focarNoDia(): void {
  painel.value?.querySelector<HTMLElement>(`[data-iso="${foco.value}"]`)?.focus();
}

// ── posição do popover (fixa, calculada a partir do campo) ──────────────────────────────────────────

function posicionar(decidirLado = false): void {
  const ancora = digitavel.value ? caixa.value : botao.value;
  if (!aberto.value || modo.value !== "popover" || !ancora) return;
  const campo = ancora.getBoundingClientRect();
  const altura = painel.value?.offsetHeight || ALTURA_POPOVER;
  const largura = Math.min(painel.value?.offsetWidth || LARGURA_POPOVER, window.innerWidth - 2 * MARGEM);
  const esquerda = Math.min(Math.max(campo.left, MARGEM), window.innerWidth - largura - MARGEM);
  if (decidirLado) {
    const cabeAbaixo = campo.bottom + 4 + altura <= window.innerHeight - MARGEM;
    const cabeAcima = campo.top - 4 - altura >= MARGEM;
    lado.value = !cabeAbaixo && cabeAcima ? "acima" : "abaixo";
  }
  const topo =
    lado.value === "acima"
      ? campo.top - 4 - altura
      : Math.max(MARGEM, Math.min(campo.bottom + 4, window.innerHeight - altura - MARGEM));
  posicao.value = { top: `${Math.round(Math.max(MARGEM, topo))}px`, left: `${Math.round(esquerda)}px` };
}

// O painel muda de altura ao trocar de visão e ao mostrar a confirmação: reposiciona (o lado não muda).
function reposicionar(): void {
  void nextTick(() => posicionar());
}

function aoRedimensionar(): void {
  if (!aberto.value) return;
  const novo = window.matchMedia("(max-width: 1023px)").matches ? "sheet" : "popover";
  if (novo !== modo.value) modo.value = novo;
  void nextTick(() => posicionar(true));
}

watch(aberto, (valor) => {
  if (valor) {
    window.addEventListener("resize", aoRedimensionar);
    window.addEventListener("scroll", reposicionar, true);
  } else {
    window.removeEventListener("resize", aoRedimensionar);
    window.removeEventListener("scroll", reposicionar, true);
  }
});

// Trocar de visão (dias / meses / anos) troca o conteúdo do painel: o foco precisa ficar DENTRO dele (alguns
// navegadores não focam o botão clicado, e sem foco o Esc cairia no documento e fecharia o modal por trás).
watch([visao, pendente], reposicionar);
watch(visao, (nova) => {
  if (!aberto.value) return;
  void nextTick(() => {
    if (nova === "dias") focarNoDia();
    else painel.value?.querySelector<HTMLElement>(nova === "meses" ? '[data-acao="mes"]' : '[data-acao="ano"]')?.focus();
  });
});

// Bottom sheet: trava a rolagem da página por trás (mesmo mecanismo dos outros sheets). No popover, quem
// abriu o calendário (modal) já trava.
let liberarTrava: (() => void) | null = null;
watch([aberto, modo], ([estaAberto, modoAtual]) => {
  if (estaAberto && modoAtual === "sheet") {
    liberarTrava ??= adquirirTravaDeScroll();
  } else if (liberarTrava) {
    liberarTrava();
    liberarTrava = null;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", aoRedimensionar);
  window.removeEventListener("scroll", reposicionar, true);
  sairDoBloqueio?.();
  liberarTrava?.();
  liberarTrava = null;
});

// ── escolher / limpar (com confirmação quando há texto antigo) ──────────────────────────────────────

function aplicar(valor: string): void {
  emit("update:modelValue", valor);
  fechar();
}

function escolher(iso: string): void {
  if (!dentroDoIntervalo(iso, props.min, props.max)) return;
  if (textoAntigo.value) {
    pendente.value = { tipo: "escolher", iso };
    void nextTick(() => painel.value?.querySelector<HTMLElement>('[data-acao="confirmar"]')?.focus());
    return;
  }
  // Ano automático: escolher o MESMO dia que já está no campo não regrava (um "DD/MM" antigo continua como está).
  if (props.anoAutomatico && lido.value.tipo === "data" && iso === selecionado.value) {
    fechar();
    return;
  }
  aplicar(valorParaGravar(iso));
}

function escolherHoje(): void {
  if (hojeNoIntervalo.value) escolher(hojeIso.value);
}

function limpar(): void {
  if (vazio.value) return;
  if (textoAntigo.value) {
    pendente.value = { tipo: "limpar" };
    void nextTick(() => painel.value?.querySelector<HTMLElement>('[data-acao="confirmar"]')?.focus());
    return;
  }
  aplicar("");
}

function confirmar(): void {
  const atual = pendente.value;
  if (!atual) return;
  aplicar(atual.tipo === "limpar" ? "" : valorParaGravar(atual.iso));
}

function cancelarConfirmacao(): void {
  pendente.value = null;
  void nextTick(focarNoDia);
}

// ── navegação ───────────────────────────────────────────────────────────────────────────────────────

function moverFoco(iso: string): void {
  if (!iso) return;
  mirarNoDia(limitarAoIntervalo(iso, props.min, props.max));
  void nextTick(focarNoDia);
}

function mudarMes(delta: number): void {
  const alvo = somarMeses(paraISO(visivel.value.ano, visivel.value.mes, 1), delta);
  const d = parseDataISO(alvo);
  if (!d || mesForaDoIntervalo(d.ano, d.mes, props.min, props.max)) return;
  mirarNoDia(limitarAoIntervalo(somarMeses(foco.value, delta), props.min, props.max));
}

function escolherMes(mes: number): void {
  const dia = Math.min(parseDataISO(foco.value)?.dia ?? 1, diasNoMes(visivel.value.ano, mes));
  mirarNoDia(limitarAoIntervalo(paraISO(visivel.value.ano, mes, dia), props.min, props.max));
  visao.value = "dias";
}

function abrirAnos(): void {
  inicioAnos.value = visivel.value.ano - 5;
  visao.value = "anos";
}

function escolherAno(ano: number): void {
  const base = parseDataISO(foco.value);
  const mes = base?.mes ?? 1;
  const dia = Math.min(base?.dia ?? 1, diasNoMes(ano, mes));
  mirarNoDia(limitarAoIntervalo(paraISO(ano, mes, dia), props.min, props.max));
  visao.value = "dias";
}

function anoForaDoIntervalo(ano: number): boolean {
  return (!!props.max && ano > Number(props.max.slice(0, 4))) || (!!props.min && ano < Number(props.min.slice(0, 4)));
}

function mesBloqueado(mes: number): boolean {
  return mesForaDoIntervalo(visivel.value.ano, mes, props.min, props.max);
}

function aoTeclarNaGrade(evento: KeyboardEvent): void {
  const base = foco.value;
  let destino = "";
  switch (evento.key) {
    case "ArrowLeft":
      destino = somarDiasISO(base, -1);
      break;
    case "ArrowRight":
      destino = somarDiasISO(base, 1);
      break;
    case "ArrowUp":
      destino = somarDiasISO(base, -7);
      break;
    case "ArrowDown":
      destino = somarDiasISO(base, 7);
      break;
    case "Home":
      destino = somarDiasISO(base, -diaDaSemana(base));
      break;
    case "End":
      destino = somarDiasISO(base, 6 - diaDaSemana(base));
      break;
    case "PageUp":
      destino = evento.shiftKey ? somarAnos(base, -1) : somarMeses(base, -1);
      break;
    case "PageDown":
      destino = evento.shiftKey ? somarAnos(base, 1) : somarMeses(base, 1);
      break;
    case "Enter":
      evento.preventDefault();
      evento.stopPropagation();
      escolher(base);
      return;
    default:
      return; // Espaço e Tab seguem o padrão do navegador (o botão do dia reage ao clique)
  }
  evento.preventDefault();
  moverFoco(destino);
}

function aoTeclarNoPainel(evento: KeyboardEvent): void {
  if (evento.key === "Escape") {
    // Só o calendário reage: não propaga para o modal (BaseModal fecha com Esc em `document`).
    evento.preventDefault();
    evento.stopPropagation();
    if (pendente.value) cancelarConfirmacao();
    else if (visao.value !== "dias") visao.value = "dias";
    else fechar();
    return;
  }
  if (evento.key !== "Tab" || !painel.value) return;
  const focaveis = Array.from(painel.value.querySelectorAll<HTMLElement>("button:not([disabled])")).filter(
    (el) => el.tabIndex >= 0,
  );
  const primeiro = focaveis[0];
  const ultimo = focaveis[focaveis.length - 1];
  if (!primeiro || !ultimo) return;
  if (evento.shiftKey && document.activeElement === primeiro) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault();
    primeiro.focus();
  }
}

function aoTeclarNoBotao(evento: KeyboardEvent): void {
  if (evento.key === "ArrowDown" && !aberto.value) {
    evento.preventDefault();
    abrir();
  }
}

function classeDoDia(celula: { iso: string; doMes: boolean }): string[] {
  const escolhido = celula.iso === selecionado.value;
  const hoje = celula.iso === hojeIso.value;
  return [
    "flex items-center justify-center rounded-md text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-30",
    ehSheet.value ? "h-11 w-full text-[15px]" : "mx-auto h-8.5 w-8.5 text-[13px]",
    escolhido ? "bg-accent-dark font-semibold text-white" : "hover:bg-paper",
    !escolhido && hoje ? "font-semibold text-accent-dark ring-1 ring-accent-dark" : "",
    !escolhido && !hoje ? (celula.doMes ? "text-ink" : "text-ink-soft/50") : "",
  ];
}

const classeSeta = computed(() => [
  "flex shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper hover:text-accent-dark disabled:cursor-not-allowed disabled:opacity-30",
  ehSheet.value ? "h-11 w-11" : "h-8 w-8",
]);
const classeTitulo = computed(() => [
  "rounded-md px-2 font-display font-semibold text-ink transition-colors hover:bg-paper hover:text-accent-dark focus-visible:outline-2 focus-visible:outline-accent-dark",
  ehSheet.value ? "h-11 text-[16px]" : "h-8 text-[14px]",
]);
const classeAcao = computed(() => [
  "rounded-md px-3 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-40",
  ehSheet.value ? "min-h-11 text-[14px]" : "min-h-8 text-[13px]",
]);
const classeCelulaMesAno = computed(() => [
  "flex items-center justify-center rounded-md px-2 text-[13px] transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-30",
  ehSheet.value ? "h-11" : "h-8",
]);
</script>

<template>
  <div class="relative">
    <!-- Ano automático: campo digitável + limpar + calendário. A caixa leva as classes do campo (mesma altura,
         borda e fonte do modo botão); o foco vale para a caixa inteira (focus-within). -->
    <template v-if="digitavel">
      <div
        ref="caixa"
        data-campo-digitavel
        :class="[
          classeCampo ?? CAMPO_PADRAO,
          'flex items-center py-0! pr-0! focus-within:bg-white focus-within:outline-2 focus-within:outline-accent-dark',
          erro ? 'border-danger' : '',
          disabled ? 'cursor-not-allowed opacity-60' : '',
        ]"
      >
        <input
          :id="id"
          ref="entrada"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          enterkeyhint="done"
          maxlength="10"
          data-sem-maiuscula
          :value="rascunho"
          :placeholder="placeholder"
          :disabled="disabled"
          :aria-invalid="erro ? 'true' : undefined"
          :aria-describedby="erro ? erroId : undefined"
          class="min-h-[calc(1lh+1rem)] min-w-0 flex-1 self-stretch bg-transparent py-2 tracking-tight text-ink outline-none placeholder:text-ink-soft disabled:cursor-not-allowed"
          @input="aoDigitar"
          @paste="aoColar"
          @focus="aoFocar"
          @blur="aoSair"
          @keydown="aoTeclarNaEntrada"
        />
        <!-- Limpar: só com foco e texto (no celular a coluna é estreita). mousedown.prevent mantém o foco no campo
             (sem isso o blur esconderia o botão antes do clique). -->
        <button
          v-if="comFoco && rascunho && !disabled"
          :id="`${id}-limpar`"
          type="button"
          tabindex="-1"
          :aria-label="label ? `Limpar ${label}` : 'Limpar data'"
          title="Limpar"
          class="flex w-6.5 shrink-0 items-center justify-center self-stretch rounded-md text-ink-soft transition-colors hover:text-danger"
          @mousedown.prevent
          @click="limparDigitado"
        >
          <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path stroke-linecap="round" d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
        <button
          :id="`${id}-abrir-calendario`"
          type="button"
          aria-haspopup="dialog"
          :aria-expanded="aberto"
          :aria-controls="aberto ? painelId : undefined"
          :aria-label="label ? `Abrir calendário de ${label}` : 'Abrir calendário'"
          :disabled="disabled"
          class="flex w-7 shrink-0 items-center justify-center self-stretch rounded-r-md text-ink-soft transition-colors hover:text-accent-dark disabled:cursor-not-allowed"
          @click="alternar"
        >
          <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
            <path stroke-linecap="round" d="M3 8.5h14M7 2.75v3M13 2.75v3" />
          </svg>
        </button>
      </div>
      <p v-if="erro" :id="erroId" role="alert" class="mt-0.5 text-[11px] leading-tight text-danger">
        {{ mensagemErro
        }}<span v-if="avisoBloqueio" :id="`${id}-bloqueio`" class="font-semibold"> · Corrija ou limpe a data</span>
      </p>
    </template>

    <button
      v-else
      :id="id"
      ref="botao"
      type="button"
      aria-haspopup="dialog"
      :aria-expanded="aberto"
      :aria-controls="aberto ? painelId : undefined"
      :aria-label="rotuloDoBotao"
      :title="tituloDoBotao"
      :disabled="disabled"
      :data-texto-antigo="textoAntigo ? '' : undefined"
      :class="classeBotao"
      @click="alternar"
      @keydown="aoTeclarNoBotao"
    >
      <span class="min-w-0 flex-1 truncate" :class="exibido ? 'text-ink' : 'text-ink-soft'">
        {{ exibido || placeholder }}
      </span>
      <!-- Texto antigo: só um pontinho de atenção (sem ocupar largura relevante); o texto fica legível. -->
      <span
        v-if="textoAntigo"
        role="img"
        aria-label="Texto antigo (não é uma data)"
        title="Texto antigo (não é uma data)"
        data-marca-antigo
        class="size-2 shrink-0 rounded-full bg-warning-gold"
      />
      <svg
        viewBox="0 0 20 20"
        class="h-4 w-4 shrink-0 text-ink-soft"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
      >
        <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
        <path stroke-linecap="round" d="M3 8.5h14M7 2.75v3M13 2.75v3" />
      </svg>
    </button>

    <Teleport to="body">
      <!-- Camada: no celular é o fundo escuro do bottom sheet; no desktop é transparente e só captura o
           clique fora (fecha o calendário sem deixar o clique chegar ao modal por trás). -->
      <div
        v-if="aberto"
        :id="`${painelId}-camada`"
        class="fixed inset-0 z-[970]"
        :class="ehSheet ? 'flex items-end justify-center bg-ink/40' : ''"
        @click.self="fechar()"
      >
        <div
          :id="painelId"
          ref="painel"
          role="dialog"
          aria-modal="true"
          :aria-label="rotuloDoPainel"
          :data-modo="modo"
          class="border-hairline bg-paper-raised shadow-lg"
          :class="
            ehSheet
              ? 'w-full max-w-[520px] rounded-t-2xl border-t'
              : 'absolute w-68 max-w-[calc(100vw-16px)] rounded-md border'
          "
          :style="ehSheet ? { paddingBottom: 'env(safe-area-inset-bottom, 0px)' } : posicao"
          @keydown="aoTeclarNoPainel"
        >
          <div v-if="ehSheet" class="mx-auto mt-2.5 h-1 w-10 rounded-full bg-hairline" />

          <div :class="ehSheet ? 'px-4 pt-2 pb-3' : 'p-2.5'">
            <!-- Cabeçalho: mês anterior | mês e ano | mês seguinte -->
            <div class="flex items-center justify-between gap-1" :class="ehSheet ? 'mb-1.5' : 'mb-0.5'">
              <button
                type="button"
                data-acao="mes-anterior"
                aria-label="Mês anterior"
                :disabled="visao !== 'dias' || mesAnteriorBloqueado"
                :class="classeSeta"
                @click="mudarMes(-1)"
              >
                <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12.5 5l-5 5 5 5" />
                </svg>
              </button>

              <div class="flex min-w-0 items-center justify-center gap-0.5" aria-live="polite">
                <button
                  type="button"
                  data-acao="mes"
                  :aria-label="`Escolher o mês. Mês atual: ${MESES[visivel.mes - 1]}`"
                  :class="classeTitulo"
                  @click="visao = visao === 'meses' ? 'dias' : 'meses'"
                >
                  {{ capitalizar(MESES[visivel.mes - 1] ?? "") }}
                </button>
                <button
                  type="button"
                  data-acao="ano"
                  :aria-label="`Escolher o ano. Ano atual: ${visivel.ano}`"
                  :class="classeTitulo"
                  @click="visao === 'anos' ? (visao = 'dias') : abrirAnos()"
                >
                  {{ visivel.ano }}
                </button>
              </div>

              <button
                type="button"
                data-acao="mes-seguinte"
                aria-label="Próximo mês"
                :disabled="visao !== 'dias' || proximoMesBloqueado"
                :class="classeSeta"
                @click="mudarMes(1)"
              >
                <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 5l5 5-5 5" />
                </svg>
              </button>
            </div>

            <!-- Dias -->
            <div
              v-if="visao === 'dias'"
              role="grid"
              :aria-label="tituloMes"
              :aria-hidden="pendente ? 'true' : undefined"
              :class="pendente ? 'pointer-events-none opacity-50' : ''"
              @keydown="aoTeclarNaGrade"
            >
              <div role="row" class="grid grid-cols-7">
                <span
                  v-for="dia in DIAS_DA_SEMANA"
                  :key="dia.completo"
                  role="columnheader"
                  :aria-label="dia.completo"
                  class="flex items-center justify-center text-[11px] font-semibold text-ink-soft uppercase"
                  :class="ehSheet ? 'h-7' : 'h-5'"
                >
                  {{ dia.curto }}
                </span>
              </div>
              <div v-for="(semana, indice) in grade" :key="indice" role="row" class="grid grid-cols-7" :class="ehSheet ? 'gap-y-0.5' : ''">
                <div v-for="celula in semana" :key="celula.iso" role="gridcell" :aria-selected="celula.iso === selecionado">
                  <button
                    type="button"
                    :data-iso="celula.iso"
                    :tabindex="celula.iso === foco ? 0 : -1"
                    :aria-label="rotuloDoDia(celula.iso)"
                    :aria-current="celula.iso === hojeIso ? 'date' : undefined"
                    :disabled="!dentroDoIntervalo(celula.iso, min, max)"
                    :class="classeDoDia(celula)"
                    @click="escolher(celula.iso)"
                  >
                    {{ celula.dia }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Meses -->
            <div v-else-if="visao === 'meses'" class="grid grid-cols-3 gap-1" role="group" aria-label="Meses">
              <button
                v-for="(nome, indice) in MESES_ABREVIADOS"
                :key="nome"
                type="button"
                :data-mes="indice + 1"
                :aria-label="MESES[indice]"
                :aria-pressed="indice + 1 === visivel.mes"
                :disabled="mesBloqueado(indice + 1)"
                :class="[classeCelulaMesAno, indice + 1 === visivel.mes ? 'bg-accent-dark font-semibold text-white hover:bg-accent-dark' : 'text-ink']"
                @click="escolherMes(indice + 1)"
              >
                {{ capitalizar(nome) }}
              </button>
            </div>

            <!-- Anos (12 por vez) -->
            <div v-else role="group" aria-label="Anos">
              <div class="mb-1 flex items-center justify-between">
                <button type="button" data-acao="anos-anteriores" aria-label="Anos anteriores" :class="classeSeta" @click="inicioAnos -= 12">
                  <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12.5 5l-5 5 5 5" />
                  </svg>
                </button>
                <span class="text-[12px] text-ink-soft">{{ anosVisiveis[0] }} – {{ anosVisiveis[11] }}</span>
                <button type="button" data-acao="anos-seguintes" aria-label="Próximos anos" :class="classeSeta" @click="inicioAnos += 12">
                  <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 5l5 5-5 5" />
                  </svg>
                </button>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <button
                  v-for="ano in anosVisiveis"
                  :key="ano"
                  type="button"
                  :data-ano="ano"
                  :aria-pressed="ano === visivel.ano"
                  :disabled="anoForaDoIntervalo(ano)"
                  :class="[classeCelulaMesAno, ano === visivel.ano ? 'bg-accent-dark font-semibold text-white hover:bg-accent-dark' : 'text-ink']"
                  @click="escolherAno(ano)"
                >
                  {{ ano }}
                </button>
              </div>
            </div>

            <!-- Confirmação (só com texto antigo): nada é substituído sem o Confirmar -->
            <div
              v-if="pendente"
              :id="`${painelId}-confirmacao`"
              role="group"
              :aria-label="pendente.tipo === 'limpar' ? 'Confirmar a limpeza' : 'Confirmar a substituição'"
              class="rounded-md border border-warning-gold/40 bg-mainz-gold-soft p-2.5"
              :class="ehSheet ? 'mt-2' : 'mt-1.5'"
            >
              <p class="text-[12.5px] leading-snug text-ink">
                {{ pendente.tipo === "limpar" ? "Isto apaga o texto antigo:" : "Isto substitui o texto antigo:" }}
                <strong class="line-clamp-3 font-semibold break-words" :title="textoAntigo">«{{ textoAntigo }}»</strong>
              </p>
              <div class="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  data-acao="cancelar"
                  :class="[classeAcao, 'border border-hairline bg-paper-raised text-ink hover:bg-paper']"
                  @click="cancelarConfirmacao"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  data-acao="confirmar"
                  :class="[classeAcao, 'bg-accent-dark text-white hover:opacity-90']"
                  @click="confirmar"
                >
                  Confirmar
                </button>
              </div>
            </div>

            <!-- Rodapé: Hoje | Limpar -->
            <div
              v-else
              class="flex items-center justify-between border-t border-hairline"
              :class="ehSheet ? 'mt-2 pt-2' : 'mt-1 pt-1'"
            >
              <button
                type="button"
                data-acao="hoje"
                :disabled="!hojeNoIntervalo"
                :class="[classeAcao, 'text-accent-dark hover:bg-paper']"
                @click="escolherHoje"
              >
                Hoje
              </button>
              <button
                type="button"
                data-acao="limpar"
                :disabled="vazio"
                :class="[classeAcao, 'text-ink-soft hover:bg-paper hover:text-danger']"
                @click="limpar"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
