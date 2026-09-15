import { DESTINATARIO_TIPOS, DESTINATARIO_TIPO_LABEL, TIPOS_RECADO, TIPO_RECADO_LABEL } from "#shared/constants/recados";
import type { DestinatarioTipo, TipoRecado } from "#shared/types/recado";
import type { AppSelectOption } from "../types/appSelect";

export const TIPO_RECADO_OPTIONS: AppSelectOption<TipoRecado>[] = TIPOS_RECADO.map((tipo) => ({
  value: tipo,
  label: TIPO_RECADO_LABEL[tipo],
}));

export const DESTINATARIO_TIPO_OPTIONS: AppSelectOption<DestinatarioTipo>[] = DESTINATARIO_TIPOS.map((tipo) => ({
  value: tipo,
  label: DESTINATARIO_TIPO_LABEL[tipo],
}));
