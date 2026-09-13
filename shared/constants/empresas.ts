import type { EmpresaCodigo } from "#shared/types/Patient";

export const TAXA_IMPOSTO: Record<EmpresaCodigo, number> = {
  FARMAURORA: 0.16,
  MAINZFARMA: 0.135,
};

export const EMPRESA_TEMPLATE: Record<EmpresaCodigo, string> = {
  FARMAURORA: "/templates/template_farmaurora.docx",
  MAINZFARMA: "/templates/template_mainzfarma.docx",
};

export const TEMPLATE_FARMAURORA_COMPLETO = "/templates/template_farmaurora_completo.docx";
