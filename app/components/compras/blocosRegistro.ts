import type { Component } from "vue";
import type { BlocoDaCompra } from "#shared/constants/compraResumo";
import BlocoAvisos from "./blocos/BlocoAvisos.vue";
import BlocoDespachante from "./blocos/BlocoDespachante.vue";
import BlocoMedico from "./blocos/BlocoMedico.vue";
import BlocoPaciente from "./blocos/BlocoPaciente.vue";
import BlocoPagamento from "./blocos/BlocoPagamento.vue";
import BlocoProcesso from "./blocos/BlocoProcesso.vue";
import BlocoVendedorResponsavel from "./blocos/BlocoVendedorResponsavel.vue";

// Os BLOCOS do formulário da Compra: cada id de BLOCOS_DA_COMPRA (a ordem do resumo, que a Cris pediu para o formulário seguir) tem um
// componente, registrado AQUI. `titulo` nunca terá componente (é só o título do resumo). Um id novo em BLOCOS_DA_COMPRA sem componente
// nem entrada em BLOCOS_SEM_FORMULARIO quebra tests/unit/comprasBlocosOrdem.spec.ts.
export const BLOCOS: Partial<Record<BlocoDaCompra, Component>> = {
  pagamento: BlocoPagamento,
  paciente: BlocoPaciente,
  despachante: BlocoDespachante,
  vendedor_responsavel: BlocoVendedorResponsavel,
  processo: BlocoProcesso,
  medico: BlocoMedico,
  avisos: BlocoAvisos,
};

/** Ids que existem no resumo e NÃO têm campo no formulário. */
export const BLOCOS_SEM_FORMULARIO: readonly BlocoDaCompra[] = ["titulo"];

export interface GrupoVisual {
  /** O id do grupo (vira id do fieldset). */
  id: string;
  /** A legenda (11px, caixa alta pelo CSS). */
  legenda: string;
  /** Os blocos do grupo, na ordem de BLOCOS_DA_COMPRA: blocos consecutivos pequenos dividem o mesmo fieldset. */
  blocos: readonly BlocoDaCompra[];
}

/**
 * Como os blocos se agrupam nos fieldsets. A concatenação dos `blocos` de todos os grupos TEM de ser BLOCOS_DA_COMPRA sem
 * BLOCOS_SEM_FORMULARIO, na mesma ordem (conferido por teste): agrupar nunca muda a ordem dos campos.
 */
export const GRUPOS: readonly GrupoVisual[] = [
  { id: "ordens", legenda: "Ordens e medicamentos", blocos: ["medicamentos_e_ordens"] },
  { id: "pagamento", legenda: "Pagamento", blocos: ["pagamento"] },
  { id: "paciente", legenda: "Paciente", blocos: ["paciente"] },
  { id: "despachante", legenda: "Despachante", blocos: ["despachante"] },
  { id: "avisos", legenda: "Avisos", blocos: ["avisos"] },
  { id: "vendedor-processo-medico", legenda: "Vendedor, processo e médico", blocos: ["vendedor_responsavel", "processo", "medico"] },
  { id: "local-entrega", legenda: "Local e entrega", blocos: ["local_entrega"] },
  { id: "contatos", legenda: "Contatos", blocos: ["contatos"] },
];
