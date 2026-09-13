/**
 * Contrato de uma opção do <AppSelect>. Vive aqui (e não em AppSelect.vue) para
 * que os utils de opções (app/utils/{pagamento,processo}Options.ts) possam
 * importá-lo sem "subir" para a camada de componentes.
 */
export interface AppSelectOption<T extends string> {
  value: T;
  label: string;
}
