import { TIPOS_RECADO, TIPO_RECADO_LABEL } from "#shared/constants/recados";
import type { TipoRecado } from "#shared/types/recado";

export interface TipoRecadoMeta {
  label: string;
  bgClass: string;
  labelClass: string;
}

// Fundo do card inteiro (estilo post-it) — tokens --color-postit-* definidos
// em app/assets/css/main.css (@theme), classes bg-postit-* geradas
// automaticamente pelo Tailwind v4 a partir deles.
const TIPO_RECADO_BG_CLASS: Record<TipoRecado, string> = {
  urgente: "bg-postit-urgente",
  atencao: "bg-postit-atencao",
  informacao: "bg-postit-informacao",
  geral: "bg-postit-geral",
};

// Rótulo de tipo (discreto, sem pill de fundo própria): tom mais escuro da
// MESMA cor do card, não uma paleta de texto separada.
const TIPO_RECADO_LABEL_CLASS: Record<TipoRecado, string> = {
  urgente: "text-[#8a3324]",
  atencao: "text-[#7a5e12]",
  informacao: "text-[#1c5468]",
  geral: "text-[#665639]",
};

export const TIPO_RECADO_META: Record<TipoRecado, TipoRecadoMeta> = Object.fromEntries(
  TIPOS_RECADO.map((tipo) => [
    tipo,
    {
      label: TIPO_RECADO_LABEL[tipo],
      bgClass: TIPO_RECADO_BG_CLASS[tipo],
      labelClass: TIPO_RECADO_LABEL_CLASS[tipo],
    },
  ]),
) as Record<TipoRecado, TipoRecadoMeta>;
