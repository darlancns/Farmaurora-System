# AUDIT_REPORT — Farmaurora CRM

> Auditoria de leitura. **Nenhum arquivo do projeto foi alterado, formatado ou "corrigido".**
> Todas as sugestões de fix são propostas, não aplicadas.
> Data: 2026-09-09 · Escopo: `app/`, `server/`, `shared/`, `tests/`, `scripts/`, configs de raiz.
> Ferramentas executadas (somente leitura/verificação): `vue-tsc --noEmit` (raiz + 4 project
> references), `vitest run`, greps. `npm run test:e2e` e `npm run test:integration` **não**
> foram executados (exigem Supabase real + credenciais `E2E_*` que não estão disponíveis).

---

## 1. Resumo executivo

### Contagem por severidade

| Severidade | Qtd | IDs |
|---|---|---|
| Crítico | 0 | — |
| Alto | 1 | S-01 |
| Médio | 6 | M-01, M-02, M-03, M-04, M-05, M-06 |
| Baixo | 11 | B-01 … B-11 |
| Positivo (sem risco) | 11 | P-01 … P-11 |

### Contagem por área

| Área | Alto | Médio | Baixo | Positivo |
|---|---|---|---|---|
| 1. Dívida técnica e consistência | 0 | 1 | 4 | 1 |
| 2. Segurança e RBAC | 1 | 2 | 3 | 3 |
| 3. Regras de negócio e cálculos | 0 | 1 | 1 | 6 |
| 4. Cobertura de testes E2E | 0 | 2 | 1 | 0 |
| 5. Itens conhecidos pendentes | 0 | 0 | 2 | 1 |

### Achados que exigem decisão humana (não presumidos)

- **S-01** — A documentação afirma "Supabase só para Auth", mas Pacientes, Processos e
  Pagamentos hoje são persistidos em tabelas Supabase via *service role key* (RLS bypassado).
  Toda a autorização depende da camada de API.
- **B-03** — "Farmauropa" (nome público citado na pauta da auditoria) **não existe** no
  código. O rótulo público implementado é "Farmaurora". Confirmar se deveria ser outro.
- **M-04 / B-09** — O "ciclo" de status de pagamento de item (NAO_PAGO ↔ COMPLEMENTO) é só
  convenção de UI; o servidor grava qualquer status sem validar transição. Um comentário de
  tipo ainda descreve o ciclo antigo com PAGO. Confirmar se a ausência de validação é aceitável.
- **B-10** — O sino de alerta de prazo de fornecedor só aparece para quem tem escrita em
  Processos (operacional/admin). Consultor e sócio nunca veem o sino. Confirmar se é intencional.
- **3.1 (P-05)** — Fórmula da "nota cheia" reportada exatamente como está no código, para
  confirmação — não presumida certa nem errada.

---

## 2. Área 1 — Dívida técnica e consistência de código

### M-01 — Enum dos 7 consultores duplicado em 5 lugares; array hardcoded em `PatientForm.vue` viola a fonte única

- **Severidade:** Médio
- **Localização:**
  - `shared/types/Patient.ts:3-10` — union `ConsultorNome`
  - `shared/constants/consultores.ts:10-18` — array `CONSULTORES`
  - `shared/types/processo.ts:31-38` — union `ConsultorProcesso`
  - `shared/constants/processos.ts:14-22` — array `CONSULTORES_PROCESSO`
  - `app/components/PatientForm.vue:30-38` — array **local** `CONSULTORES`
- **Evidência:**
  ```ts
  // shared/constants/consultores.ts:3-9
  /** ... Fonte única — importada tanto pelo server ... quanto pelo client ...
   * Não redefinir esta lista em outro lugar. */
  export const CONSULTORES: ConsultorNome[] = [
    "André Vitório", "Gabriela Megda", "Gabriela Santana",
    "Mateus Morais", "Paulo Braga", "Thiago Guedes", "Vinícius Alves",
  ];

  // app/components/PatientForm.vue:30-38  (REDEFINE a mesma lista)
  const CONSULTORES: ConsultorNome[] = [
    "André Vitório", "Gabriela Megda", "Gabriela Santana",
    "Mateus Morais", "Paulo Braga", "Thiago Guedes", "Vinícius Alves",
  ];
  ```
- **Constatação sobre valores/ordem:** os **7 valores são idênticos** em todos os 5 pontos,
  com acentuação correta. As duas *unions* de tipo (`ConsultorNome`, `ConsultorProcesso`)
  listam na ordem "André, Mateus, Paulo, Thiago, Gabriela Megda, Gabriela Santana, Vinícius"
  (não-alfabética); os três *arrays* de runtime listam em ordem **alfabética**. Como *union*
  não tem ordem em runtime, isso é apenas cosmético. O problema real é o array **local de
  `PatientForm.vue`**, que contradiz explicitamente `consultores.ts:8` ("Não redefinir esta
  lista em outro lugar") e o princípio de fonte única do `CLAUDE.md`. A página de
  Configurações (`ContaFormModal.vue`) consome `CONSULTORES` do `#shared`; `PatientForm.vue`, não.
- **Impacto:** adicionar/renomear/remover um consultor exige editar 5 locais. `PatientForm.vue`
  vai divergir silenciosamente (sem erro de tipo, porque os literais ainda satisfazem
  `ConsultorNome`). Risco funcional hoje ≈ 0 (valores batem); risco de manutenção alto.
- **Sugestão de fix (proposta):** em `PatientForm.vue`, `import { CONSULTORES } from
  "#shared/constants/consultores"` e derivar `consultorOptions` dele. Adicionar um unit test
  que afirme que `CONSULTORES` == membros de `ConsultorNome` (e o par Processo). Uniformizar a
  ordem (alfabética) nas duas *unions* para reduzir confusão.

### B-01 — Duplicação por domínio de outros enums (intencional, sem cópia divergente detectada)

- **Severidade:** Baixo (informativo)
- **Localização:** `shared/types/Pagamento.ts` + `shared/constants/pagamentos.ts` vs
  `shared/types/processo.ts` + `shared/constants/processos.ts`.
- **Evidência / verificação de igualdade:**
  - **Fornecedores** — `FORNECEDORES_PAGAMENTO` (`pagamentos.ts:36-42`) e
    `FORNECEDORES_PROCESSO` (`processos.ts:34-40`): ambos
    `["Beldimed - Bélgica", "Pharyx - China", "Poros - Turquia", "Speciality - Índia", "Outro"]`
    — idênticos, "Outro" por último.
  - **Despachantes** — `DESPACHANTES_PAGAMENTO` / `DESPACHANTES_PROCESSO`:
    `["Andreza Faconi", "Bruno Lopes", "Marcelo Lima"]` — idênticos.
  - **Empresa** — `EmpresaPagamento` / `EmpresaProcesso` / `EmpresaCodigo`:
    `"FARMAURORA" | "MAINZFARMA"` — idênticos.
  - **Transportadoras** — `TRANSPORTADORAS_PAGAMENTO = ["AJC", "Doctor"]` (só em Pagamento).
  - **Status de pagamento de processo** — `STATUS_PAGAMENTO_PROCESSO = ["pago", "pendente"]`
    (só em Processo).
- **Constatação:** cada arquivo **documenta** que a réplica é intencional ("Pagamento não
  importa nada de Processo", `Pagamento.ts:2-6`; `pagamentos.ts:12-13,33-35,44-46`). Segue o
  precedente do projeto de declarar por domínio. **Nenhuma cópia desatualizada foi encontrada.**
- **Sugestão de fix (proposta, opcional):** manter a separação por domínio mas adicionar um
  unit test de "listas paralelas iguais" (`FORNECEDORES_PAGAMENTO` deve casar com
  `FORNECEDORES_PROCESSO`, etc.) para que qualquer *drift* futuro quebre o build.

### B-02 — Sem `console.log`/`debugger`/`TODO`/`FIXME`/código comentado no código de produção

- **Severidade:** Baixo (resultado majoritariamente positivo)
- **Evidência:** `grep -rn "console\.|debugger|TODO|FIXME" app/ server/ shared/` → **nenhuma
  ocorrência**. Os `console.log` do repositório estão só em `scripts/migration/*` e
  `scripts/integration/*` (ferramentas CLI — esperado).
- **Ressalva:** `.env` (arquivo local, não versionado) contém
  `# TODO: trocar por um e-mail admin real antes de usar /api/admin/users` na linha de
  `NUXT_ADMIN_EMAILS`. Não é código, mas indica que a config admin pode ainda estar num
  placeholder no ambiente atual.
- **Sugestão de fix (proposta):** confirmar que `NUXT_ADMIN_EMAILS` do ambiente de produção
  aponta para um e-mail real da equipe.

### B-03 — "Farmauropa" não existe no código; premissa da auditoria não confirmada

- **Severidade:** Baixo (dúvida documentada, não presumida)
- **Localização:** `shared/constants/empresas.ts:8-11`, `shared/constants/pagamentos.ts:16-19`.
- **Evidência:**
  ```ts
  // shared/constants/empresas.ts:8-11
  export const EMPRESA_LABEL: Record<EmpresaCodigo, string> = {
    FARMAURORA: "Farmaurora",
    MAINZFARMA: "MainzFarma",
  };
  ```
  `grep -rni "farmaur|mainz|farmauropa"` em `app/ server/ shared/` → **nenhuma ocorrência de
  "Farmauropa"**. O valor de código/enum é `FARMAURORA` e o rótulo público é `"Farmaurora"`,
  usados de forma consistente (nenhuma troca detectada).
- **Impacto:** se o nome público correto for "Farmauropa", ele simplesmente não está
  implementado. Se o nome público é "Farmaurora", está tudo certo.
- **Sugestão de fix (proposta):** confirmar com o responsável qual é o nome público correto;
  se for "Farmauropa", trocar em `EMPRESA_LABEL` / `EMPRESA_PAGAMENTO_LABEL` (2 lugares).

### B-04 — Type-check passa limpo, mas não roda no build nem em CI

- **Severidade:** Baixo
- **Evidência:**
  - `npx vue-tsc --noEmit` na raiz **e** em `.nuxt/tsconfig.{app,server,shared,node}.json`:
    **0 erros, 0 warnings** (exit 0 nos 5).
  - `npx vitest run`: **62 testes, 5 arquivos, todos passam** (~305 ms).
  - `nuxt.config.ts:48` tem `typescript: { strict: true }` mas **não** `typeCheck: true`;
    `package.json` **não** tem script `typecheck`; não há workflow de CI no repositório.
- **Impacto:** regressões de tipo só são pegas se alguém rodar `vue-tsc` manualmente. `vue-tsc`
  já está em `devDependencies`.
- **Sugestão de fix (proposta):** adicionar `"typecheck": "vue-tsc --noEmit"` ao `package.json`
  e rodá-lo (com `vitest run`) num CI; opcionalmente `typescript.typeCheck: true` no
  `nuxt.config.ts`.

### B-05 — Aderência ao `CLAUDE.md`: boa; 2 desvios pontuais

- **Severidade:** Baixo
- **Conformidades verificadas:**
  - Imports explícitos, sem auto-import: `nuxt.config.ts` (`imports.autoImport: false`,
    `components: false`); todos os `.ts`/`.vue` importam explicitamente. ✔
  - Nomenclatura: componentes PascalCase (`PatientForm.vue`, `AppSelect.vue`…), utils
    camelCase (`formatDate`… `prazoFornecedor.ts`…), middleware camelCase
    (`auth.global.ts`, `authz.global.ts`), páginas minúsculas (`login.vue`, `inicio.vue`…),
    contratos em `shared/types/`, rotas em `server/api/`. ✔
- **Desvios:**
  1. `app/components/PatientForm.vue:30-38` redefine `CONSULTORES` (ver **M-01**), contra
     `shared/constants/consultores.ts:8`.
  2. `CLAUDE.md` princípio 1 pede "ID fixo para evitar problemas de hidratação".
     `app/components/AppSelect.vue:35` deriva IDs de `props.id ?? "app-select"` — quando a prop
     `id` não é passada, dois `<AppSelect>` na mesma tela produzem `id="app-select-listbox"`
     duplicado (DOM/a11y inválido). A `<ul>` é `v-if="open"` (só client), então **não** causa
     *mismatch* de hidratação, só ID duplicado em runtime. A maioria das chamadas passa `id`.
- **Sugestão de fix (proposta):** (1) ver M-01; (2) tornar `id` obrigatório em `AppSelect` ou
  gerar um sufixo estável via `useId()` do Vue 3.5.

---

## 3. Área 2 — Segurança e RBAC

### S-01 — Arquitetura de persistência real diverge da documentação ("Supabase só para Auth")

- **Severidade:** Alto
- **Localização:**
  - `server/utils/processosStore.ts:13,44,202-265` — tabela Supabase `follow_up`
  - `server/utils/patientsStore.ts:8,35,143-238` — tabela `prestacao_pacientes`
  - `server/utils/pagamentosStore.ts:19,70-72,258-677` — tabelas `pagamento_lotes_banco`,
    `pagamento_lancamentos_banco`, `pagamento_grupos`
  - `server/utils/supabaseServerClient.ts:42-57` — `createSupabaseAdminClient()` usa a
    **service role key** (bypassa RLS)
  - Documentação contraditória: `shared/types/auth.ts:6` ("O Supabase é usado SOMENTE para
    autenticação neste projeto"); `nuxt.config.ts:11-12` ("Supabase é usado SOMENTE para
    autenticação"); `.env.example:8-9` ("Nenhum dado de negócio ... vive no Supabase");
    `README.md:16-17,66-68` (descreve `data/patients.json` como storage).
- **Evidência:**
  ```ts
  // server/utils/processosStore.ts:202-210
  export async function listProcessos(): Promise<Processo[]> {
    const db = createSupabaseAdminClient();          // service role — sem RLS
    const { data, error } = await db.from(TABELA)    // TABELA = "follow_up"
      .select("*").order("created_at", { ascending: false }).order("id", { ascending: true });
    ...
  }
  ```
  Todos os stores (`patients`, `processos`, `pagamentos` banco/grupos) fazem
  `db.from(TABELA).select|insert|update|delete` com essa mesma conexão. Os `data/*.json`
  correspondentes **não são mais lidos** (só `data/pagamentos-*-pix.json`, ver M-02).
- **Impacto:**
  1. Documentação enganosa: um dev novo assume que o dado sensível está em arquivos e que o
     Supabase não guarda PII/financeiro.
  2. **Não há RLS como segunda linha de defesa.** O controle de acesso a *todo* dado de
     negócio depende 100% de `server/middleware/auth.ts` + row-scoping por handler.
  3. `sectionForApiPath` (`shared/utils/rbac.ts:67-75`) retorna `null` para rotas `/api` não
     mapeadas, e o middleware trata `null` como **"exige só sessão"**
     (`server/middleware/auth.ts:66-67`, `if (!section) return;`). Qualquer endpoint novo sob
     um prefixo não previsto fica acessível a **qualquer sessão autenticada**, incluindo
     `consultor`.
- **Sugestão de fix (proposta):**
  1. Atualizar `shared/types/auth.ts`, `nuxt.config.ts`, `.env.example`, `README.md` e os
     comentários de cabeçalho dos stores para descrever a arquitetura real (Postgres/Supabase,
     acesso via service role, controle na API).
  2. Habilitar RLS nas tabelas como defesa em profundidade (mesmo que a API use service role),
     ou ao menos documentar por que não.
  3. Trocar o default de `sectionForApiPath` de "permitir com sessão" para "negar" (allowlist
     explícita das poucas rotas sem seção, como já existe `AUTHENTICATED_ANY_PREFIXES`).

### M-02 — Anexos e chaves PIX persistidos em filesystem local; anexos servidos sem checagem de acesso

- **Severidade:** Médio
- **Localização:**
  - `server/api/attachments/index.post.ts:49-51` — `writeFile` em
    `public/uploads/attachments/<patientId>/<slotKey>.png` (via `process.cwd()`,
    `server/utils/attachmentPaths.ts:5-13`)
  - `server/utils/pagamentosPixStore.ts:25-27,80-92` — `data/pagamentos-despachante-pix.json`
    e `data/pagamentos-transportadora-pix.json`
  - `shared/utils/attachments.ts:1-3` — URL pública `/uploads/attachments/<id>/<slot>.png`
- **Evidência:**
  ```ts
  // server/api/attachments/index.post.ts:49-53
  await mkdir(getAttachmentDir(patientId), { recursive: true });
  const buffer = Buffer.from(extractBase64Data(imageBase64), "base64");
  await writeFile(getAttachmentFilePath(patientId, slotKey), buffer);
  return { url: getAttachmentPublicUrl(patientId, slotKey), patient };
  ```
- **Impacto:**
  - Deploy multi-instância/serverless quebra anexos e overrides de PIX (não compartilhados
    entre instâncias; perdidos em container efêmero). O `README.md:66-68` menciona o problema
    só para `patients.json`, não para anexos/PIX.
  - Anexos ficam sob `public/` → **servidos como estático, sem passar por RBAC**. Quem tiver a
    URL (`/uploads/attachments/<id>/<slot>.png`) baixa a imagem de invoice/câmbio/nota. Os IDs
    são `p_<timestamp>_<6 chars aleatórios>` — não triviais de adivinhar, mas isso não é
    controle de acesso. (Escrita de anexo é admin-only via seção `patients`; leitura não é
    protegida.)
- **Nota positiva:** `SAFE_ATTACHMENT_KEY = /^[a-zA-Z0-9_-]+$/` (`attachmentPaths.ts:3`) é
  aplicado a `patientId` **e** `slotKey` no handler — sem `.` nem `/`, **path traversal
  mitigado**.
- **Sugestão de fix (proposta):** mover anexos para Supabase Storage (bucket privado + signed
  URLs) ou servi-los por um endpoint autenticado sob `/api/**`; mover overrides de PIX para
  uma tabela.

### M-03 — `.gitignore` não cobre todos os arquivos de dados sensíveis (latente — ainda não é git repo)

- **Severidade:** Médio
- **Localização:** `.gitignore` (raiz) vs `data/`.
- **Evidência:**
  - `.gitignore` ignora: `data/patients.json`, `data/processos.json`, `public/uploads/`.
  - **Não ignora:** `data/patients.backup.json`, `data/pagamentos-grupos.json`,
    `data/pagamentos-banco.json`, `data/pagamentos-despachante-pix.json`,
    `data/pagamentos-transportadora-pix.json`.
  - Conteúdo real observado:
    ```json
    // data/pagamentos-grupos.json (trecho)
    { "nomeGrupo": "AJC", "chavePix": "09.614.254/0001-74",
      "itens": [ { "paciente": "Maria de Lourdes Santos Ribeiro", "valor": 1834.59, "status": "COMPLEMENTO" }, ... ] }
    // data/pagamentos-despachante-pix.json
    { "Marcelo Lima": "05.342.805/0001-37", "Andreza Faconi": "67.592.120/0001-04", "Bruno Lopes": "036.223.838-36" }
    ```
    (`data/patients.json`/`.backup.json` contêm nome completo + medicamentos + valores.)
  - Ambiente da auditoria reporta **"Is a git repository: false"** — nada versionado ainda.
  - `data/patients.json` e `data/processos.json` são **stale** (nenhum store os lê — só o
    `pixStore` lê os `*-pix.json`), mas seguem no diretório com dados reais.
- **Impacto:** um `git init` + `git add .` colocaria PII de pacientes, valores financeiros e
  CPF/CNPJ de PIX no primeiro commit.
- **Sugestão de fix (proposta):** `.gitignore` → `data/*.json` (com `!data/.gitkeep`); apagar
  do disco os arquivos de migração já migrados (`patients.json`, `patients.backup.json`,
  `processos.json`, `pagamentos-grupos.json`, `pagamentos-banco.json`); manter só os
  `*-pix.json` (ainda em uso) e mesmo assim ignorá-los.

### B-06 — PATCH/DELETE de processo não aplicam row-scoping de `consultor` (inócuo hoje, frágil)

- **Severidade:** Baixo
- **Localização:** `server/api/processos/[id].patch.ts`, `server/api/processos/[id].delete.ts`.
- **Evidência:** ao contrário de `index.get.ts:13-16` e `[id].get.ts:23-25` (que filtram/404
  por `user.consultorNome`), os handlers de PATCH e DELETE não fazem nenhuma verificação de
  dono — chamam `patchProcesso`/`deleteProcesso` direto após validar o body.
- **Impacto:** hoje **nulo**, porque `WRITE_ACCESS.processos = ["operacional", "administrador"]`
  (`shared/utils/rbac.ts:33`) e esses cargos enxergam todos os processos — `consultor` é
  barrado com 403 no middleware antes de chegar ao handler. Se um dia `consultor` (ou um novo
  cargo) ganhar escrita em processos, esses dois endpoints vazam edição/exclusão de processos
  de terceiros.
- **Sugestão de fix (proposta):** adicionar o mesmo guard de `isRowScopedToOwnConsultor` +
  `processo.consultor === user.consultorNome` (→ 404) nesses handlers, para não depender da
  política de escrita atual.

### B-07 — Proteção anti-lockout cobre só "último admin"; self-delete permitido com 2+ admins; checagem não-atômica

- **Severidade:** Baixo (comportamento aparentemente **intencional** — confirmar)
- **Localização:** `server/api/admin/users/[id].delete.ts:25-37`,
  `server/api/admin/users/[id].patch.ts:42-57`, `server/utils/authUser.ts:70-92`,
  `app/components/configuracoes/ContasTab.vue`.
- **Evidência (edge case de `countAdmins`):**
  ```ts
  // [id].delete.ts:30-37
  const targetIsAdmin = toAdminUserSummary(target).role === "administrador";
  const adminCount = users.filter((u) => toAdminUserSummary(u).role === "administrador").length;
  if (targetIsAdmin && adminCount <= 1) {
    throw createError({ statusCode: 400, statusMessage: "Não é possível excluir o único administrador restante." });
  }
  ```
  - **Com 1 admin** (a própria conta): PATCH `role: "socio"` → 400 "único administrador";
    DELETE da própria conta → 400 "único administrador"; POST `reset-password` da própria
    conta → **200** (permitido, sem risco de lockout). Cenário coberto por
    `tests/e2e/configuracoes.spec.ts` ("guarda anti-lockout — cenário (a)").
  - **Com 2+ admins:** um admin **pode excluir ou demover a própria conta** e sair da tela.
    `tests/e2e/configuracoes.spec.ts` teste 7 ("guardas antigas removidas — o próprio admin
    agora vê e usa as ações") + cenário (b) confirmam que **isso é intencional**.
    `ContasTab.vue` mostra "(você)" na própria linha mas **não desabilita** o botão Excluir.
  - `listAllAuthUsers`/`countAdmins` paginam corretamente (`perPage: 1000`, trava de 100
    páginas, fallback por tamanho de página) — coberto por `tests/unit/rbac.spec.ts`
    ("countAdmins ... paginando").
- **Ressalva de corrida:** a leitura de `adminCount` e o `deleteUser`/`updateUserById` não são
  atômicos. Dois DELETEs simultâneos de dois admins distintos poderiam ambos ver `adminCount = 2`,
  passar pela checagem e zerar os admins. Probabilidade baixíssima (operador único), mas real.
- **Sugestão de fix (proposta):** se o self-delete com pares for indesejado, desabilitar
  Excluir/Demover na própria linha no client + recontar admins após a operação. Para a corrida,
  reconsultar `countAdmins` imediatamente após a escrita e, se ficou 0, reverter (ou usar uma
  função Postgres transacional).

### B-08 — Backdoor permanente por `NUXT_ADMIN_EMAILS` (rede de segurança de migração sem prazo)

- **Severidade:** Baixo
- **Localização:** `server/utils/authUser.ts:121-146` (`resolveAuthUser`).
- **Evidência:**
  ```ts
  // authUser.ts:126-132
  if (isRole(meta.role)) { role = meta.role; }
  else if (email && adminEmails.includes(email.toLowerCase())) { role = "administrador"; }
  else { role = "consultor"; }
  ```
- **Impacto:** qualquer conta cujo e-mail esteja em `NUXT_ADMIN_EMAILS` e que **não tenha**
  `app_metadata.role` gravado é tratada como `administrador` — inclusive uma conta recém
  importada/criada sem metadados. É env server-only (risco limitado a quem controla o deploy),
  mas é uma regra implícita, sem data de expiração nem flag para desligar. Comentado como "rede
  de segurança da migração".
- **Sugestão de fix (proposta):** depois que todas as contas admin tiverem `app_metadata.role`
  gravado, remover esse ramo (ou trocar por um bootstrap único e explícito).

### P-01 — RBAC no server presente, coerente com o client e testado

- **Severidade:** Positivo
- **Evidência:**
  - `server/middleware/auth.ts` roda em toda request: 401 sem sessão em `/api/**`; 403 por
    `canReadSection`/`canWriteSection` (de `shared/utils/rbac.ts`) conforme
    `isWriteMethod(getMethod())`.
  - Client (`app/middleware/authz.global.ts`, `app/composables/useAuth.ts`,
    `app/components/SidebarNav.vue`, páginas) usa **as mesmas funções** de
    `shared/utils/rbac.ts` — política única para os dois lados.
  - `consultor` **row-scoped na query, não só na UI**: `server/api/processos/index.get.ts:13-16`
    filtra `processo.consultor === user.consultorNome` (sem nome → `[]`);
    `[id].get.ts:23-25` responde 404 para processo de outro (não vaza existência).
    `app/pages/processos.vue:43-45` re-filtra no client como defesa em profundidade.
  - Cobertura: `tests/unit/rbac.spec.ts` (política pura, 4 cargos × 5 seções + helpers);
    `tests/e2e/rbac.spec.ts` ("consultor: só os próprios processos", "não dá pra se
    auto-promover mexendo em localStorage/cookie" — o server resolve o cargo pelo JWT
    assinado, não pelo storage do client).

### P-02 — Escrita em `app_metadata` só server-side; `consultorNome` limpo com `null` explícito

- **Severidade:** Positivo
- **Evidência:**
  - Toda gravação de cargo passa por `admin.auth.admin.createUser` / `updateUserById` com
    service role: `server/api/admin/users.post.ts:56-61`,
    `server/api/admin/users/[id].patch.ts:59-61`. O client (`login.vue`) só chama
    `signInWithPassword`.
  - `server/utils/authUser.ts:58-60`:
    ```ts
    export function roleAppMetadata(role: Role, consultorNome?: ConsultorNome) {
      return { role, consultorNome: role === "consultor" ? consultorNome : null };
    }
    ```
    Define **`null` explícito** (não omite a chave) — o GoTrue faz merge raso e apaga chave
    nula. Coberto por `tests/unit/rbac.spec.ts` ("roleAppMetadata — limpa consultorNome órfão").

### P-03 — Service role key não vaza para o client

- **Severidade:** Positivo
- **Evidência:** `nuxt.config.ts:runtimeConfig` mantém `supabaseServiceRoleKey` e `adminEmails`
  **fora** de `public`. `supabaseServerClient.ts:43-45` lê `config.supabaseServiceRoleKey` (sem
  `.public`). O client (`app/utils/supabaseClient.ts:19-20`) só usa `public.supabaseUrl` /
  `public.supabaseAnonKey`. `tests/e2e/auth.spec.ts` teste 7 varre o HTML de `/login` e
  `/inicio` por `"service_role"` / `"supabaseservicerolekey"` / valor real da chave. `.env`
  está em `.gitignore`. (A anon key exposta no bundle é o design esperado do Supabase.)

---

## 4. Área 3 — Regras de negócio e cálculos (reportado, NÃO corrigido)

### P-05 — Fórmula da "nota cheia" — como está implementada hoje (para confirmação humana)

- **Severidade:** Positivo (reporte factual — não presumido certo nem errado)
- **Localização:** `app/utils/calculations.ts:26-75`.
- **Evidência (verbatim):**
  ```ts
  // isNotaCheia (linhas 26-34)
  if (alvara <= 0) return false;
  return (custoImportacao + despesaTotal + transporteTotal) / alvara < 0.5;

  // calculateValorNota (linhas 42-52)
  if (isNotaCheia(alvara, custoImportacao, despesaTotal, transporteTotal)) {
    return alvara;                                             // nota cheia → alvará cheio, sem desconto
  }
  return alvara - custoImportacao - despesaTotal - transporteTotal;   // não cheia

  // calculateImposto (linhas 54-56)
  return valorNota * TAXA_IMPOSTO[empresa];                    // FARMAURORA 0.16 · MAINZFARMA 0.135

  // withComputedFields (linhas 58-75) também expõe:
  //   valorTotal: patient.alvara
  //   taxaImposto: TAXA_IMPOSTO[patient.empresa]
  //   isNotaCheia: (mesmo predicado acima)
  ```
- **Contexto:** o cabeçalho do arquivo (linhas 4-25) declara que a regra foi "confirmada com o
  usuário — já revisada 3 vezes, NÃO reinterpretar". Descreve exatamente a implementação acima
  (3ª revisão: `valorNota` quando cheia = alvará cheio).
- **Inconsistência de documentação (ver B-11):** `README.md:22-24` está **desatualizado** — diz
  `valor da nota = alvará − custo de importação` (sem despesa/transporte e sem o caso "cheia").
- **Sugestão de fix (proposta):** nenhuma alteração de cálculo — apenas confirmar com o
  responsável que o predicado `< 0.5` e o "alvará cheio quando cheia" continuam corretos, e
  atualizar o `README.md`.

### P-06 — Cotação Câmbio: fórmula e simetria entre os 3 bancos — confirmadas

- **Severidade:** Positivo
- **Localização:** `app/utils/pagamentoCalculations.ts:47-126`, `server/utils/pagamentosStore.ts:139-176`.
- **Evidência:**
  ```ts
  // pagamentoCalculations.ts:47-54
  export function calcularTotalReais(totalMoeda, taxa, taxaCorretagem) {
    if (taxa === null) return null;
    return totalMoeda * taxa + taxaCorretagem;      // == esperado: totalMoeda * taxa + taxaCorretagem
  }
  ```
  `montarCotacao` (linhas 85-111) mapeia sobre `normalizarOpcoes`, que sempre devolve
  `BANCOS_CAMBIO = ["XP", "RENDIMENTO", "INTEX"]` (`shared/constants/pagamentos.ts:73`) na ordem
  canônica; o **mesmo** `totalMoeda` e a **mesma** função são aplicados aos três — sem ramo
  especial por banco. `calcularValorReaisLancamento` (linha 58): quando o banco é escolhido,
  `valorReais = valorMoeda * taxa` **sem corretagem** (a corretagem só entra no total agregado).
  Persistência achatada em colunas por banco (`xp_taxa`, `xp_taxa_corretagem`, …) na mesma
  ordem canônica (`pagamentosStore.ts:139-143`).
- **Nota terminológica:** código usa `XP`/`RENDIMENTO`/`INTEX` (labels "XP"/"Rendimento"/"Intex")
  — os "três bancos XP, Rendimento, Intex" da pauta.

### M-04 — Ciclo de status de pagamento de item: sem validação de transição no servidor

- **Severidade:** Médio
- **Localização:**
  - `shared/constants/pagamentos.ts:85` — `STATUS_ITEM_GRUPO_ORDER = ["NAO_PAGO","PAGO","COMPLEMENTO"]`
  - `shared/constants/pagamentos.ts:90` — `STATUS_ITEM_GRUPO_CICLO = ["NAO_PAGO","COMPLEMENTO"]` (o ciclo clicável real; PAGO saiu)
  - `app/utils/pagamentoStatus.ts:30-34` — `proximoStatusItemGrupo` alterna só NAO_PAGO↔COMPLEMENTO
  - `server/utils/pagamentosStore.ts:604-619` — `atualizarItemGrupo`: **gravação direta** de `dto.status`
  - `server/utils/pagamentoValidation.ts:138-142` — `isValidAtualizarItemGrupo` valida só `status ∈ STATUS_ITEM_GRUPO_ORDER` e `index` inteiro ≥ 0
- **Evidência:**
  ```ts
  // pagamentosStore.ts:604-619 (comentário linha 603: "gravação direta do status, sem ciclo no servidor")
  const item = itens[dto.index];
  if (!item) throw createError({ statusCode: 400, statusMessage: "Item do grupo inexistente." });
  itens[dto.index] = { ...item, status: dto.status };          // qualquer status → qualquer status
  ```
- **Constatação:** a API aceita **qualquer** transição entre os 3 valores para qualquer item
  (NAO_PAGO→PAGO direto, COMPLEMENTO→NAO_PAGO, PAGO→COMPLEMENTO), desde que o cargo tenha
  escrita em `pagamentos`. Não há "pular estado proibido" porque não existe máquina de estados
  no servidor — é rótulo livre por design (regra 3d). A UI (botão de ciclo) só oferece
  NAO_PAGO↔COMPLEMENTO; `pagarGrupoPagamento` (linhas 662-677) promove NAO_PAGO→PAGO em lote e
  fecha o grupo.
- **Impacto:** cliente com cargo `operacional`/`administrador` pode, via chamada direta à API,
  colocar itens em estados fora do ciclo da UI. Sem trilha de auditoria de quem/quando. Risco
  operacional baixo (operador único), mas o "ciclo" é só convenção de front, não garantido.
- **Sugestão de fix (proposta):** validar a transição em `atualizarItemGrupo` (permitir só
  NAO_PAGO↔COMPLEMENTO; rejeitar `PAGO` fora de `pagarGrupoPagamento`). Ver também B-09.

### B-09 — Comentário de tipo descreve ciclo de status antigo (com PAGO)

- **Severidade:** Baixo
- **Localização:** `shared/types/Pagamento.ts:31-33`.
- **Evidência:**
  ```ts
  // Pagamento.ts:31-32
  // Ciclo clicável na aba Despachante/Transportadora: NAO_PAGO -> PAGO -> COMPLEMENTO -> NAO_PAGO.
  export type StatusItemGrupo = "NAO_PAGO" | "PAGO" | "COMPLEMENTO";
  ```
  Contradiz `shared/constants/pagamentos.ts:87-90` ("'Pago' saiu do ciclo") e
  `STATUS_ITEM_GRUPO_CICLO = ["NAO_PAGO","COMPLEMENTO"]`.
- **Impacto:** leva a entender que a UI cicla por PAGO, o que não acontece.
- **Sugestão de fix (proposta):** ajustar o comentário para descrever o ciclo real
  (NAO_PAGO ↔ COMPLEMENTO; PAGO só via "Marcar grupo como pago").

### P-07 — Pagamento sempre em nível de grupo/lote (nunca item a item) — confirmado

- **Severidade:** Positivo
- **Evidência:**
  - **Grupos:** único caminho de "pagar" é `pagarGrupoPagamento`
    (`server/api/pagamentos/{despachante,transportadora}/[id]/pagar.patch.ts` →
    `pagamentosStore.ts:662-677`), que fecha o grupo inteiro (`realizado=true`, `pagoEm`,
    promove todos os NAO_PAGO→PAGO). Não há endpoint de "pagar 1 item". `atualizarItemGrupo` só
    muda rótulo e **não move o grupo** (comentário linha 603).
  - **Banco:** `fecharLoteBanco` (`pagamentosStore.ts:465-488`) fecha o lote inteiro e exige
    `banco_escolhido != null`. Lançamentos individuais não têm estado "pago".
  - Simetria despachante/transportadora: arquivos espelhados
    (`server/api/pagamentos/despachante/[id]/{item.patch,item.delete,pagar.patch}.ts` e os
    equivalentes em `transportadora/`).

### P-08 — Invalidação de cotação preserva `taxaCorretagem` editada manualmente — confirmado

- **Severidade:** Positivo
- **Localização:** `server/utils/pagamentosStore.ts:239-254` (`invalidarCotacao`), chamada em
  `criarLancamentoBanco:309`, `atualizarLancamentoBanco:375`, `removerLancamentoBanco:396`.
- **Evidência:**
  ```ts
  // invalidarCotacao (linhas 240-253)
  .update({ banco_escolhido: null, taxa_escolhida: null,
            xp_taxa: null, rendimento_taxa: null, intex_taxa: null })   // NÃO toca *_taxa_corretagem
  ...
  db.from(T_LANC).update({ valor_reais: null }).eq("lote_id", loteId);
  ```
  Ao adicionar/editar/remover lançamento num lote já cotado (`banco_escolhido != null`), zera
  banco/taxa escolhidos e as 3 taxas cotadas e devolve `valorReais` de todos os lançamentos a
  `null`; as **corretagens permanecem**. Regra 3c documentada nas linhas 56-57 e 236-238.

### P-09 — `totalMoeda` / `valorMoeda` usados de forma consistente (suporte USD + EUR) — confirmado

- **Severidade:** Positivo
- **Evidência:** `grep` por `*Dolares` / `*Usd` / `totalDolar` em `app/ server/ shared/` →
  **nenhuma ocorrência**. Tipos usam `Moeda = "USD" | "EUR"` (`shared/types/Pagamento.ts:10`);
  campos `valorMoeda` / `totalMoeda` em `LancamentoBanco`, `CotacaoOpcaoView`, `LoteBancoView`.
  `MOEDAS = ["USD","EUR"]`, `MOEDA_SIMBOLO` (`pagamentos.ts:21,28`).

### P-10 — Sino de notificação de fornecedor: lógica e supressões — verificadas (1 ponto a confirmar em B-10)

- **Severidade:** Positivo
- **Localização:** `app/utils/prazoFornecedor.ts:55-92`,
  `app/components/processos/NotificacaoFornecedorBell.vue`.
- **Evidência:**
  - Prazo em **dias corridos** desde `datas.dataCompraPO` (dia da compra = dia 0):
    `Poros - Turquia` 3, `Speciality - Índia` 3, `Beldimed - Bélgica` 7, `Pharyx - China` 10
    (`prazoFornecedor.ts:8-13`). Fornecedor fora da tabela (inclui `"Outro"` e valores legados
    sem sufixo de país, ex. `"Poros"` sozinho) → **sem alerta**, sem inferência por aproximação.
  - Supressões: `processo.alertaFornecedorResolvido === true` (linha 63) **ou**
    `datas.aberturaThread?.trim()` não-vazio (linha 64). `dataCompraPO` ausente ou não
    parseável (`parseDataBR` rejeita `"31/02"`, `"ASD"`, `""`, `undefined`) → sem alerta.
  - `diasDeAtraso` = dias desde o **prazo final** (`dataCompraPO + prazoDias`), não desde a
    compra. Dispara quando `hojeZerado >= prazoFinalZerado` (linha 78). Ordena desc por
    `diasDeAtraso`.
  - Cobertura: `tests/unit/prazoFornecedor.spec.ts` (14 casos) cobre todos esses ramos,
    inclusive prazo por fornecedor e ordenação.
  - Remoção otimista (`NotificacaoFornecedorBell.vue:36-44`): adiciona a `dismissedIds` antes
    do PATCH; em erro, reverte e mostra toast. O PATCH bem-sucedido atualiza o estado local
    via `useProcessos.patchProcesso`, então o `computed` recalcula e o item some de qualquer
    forma. Sem inconsistência detectada nesse fluxo.

### B-10 — Sino de alerta de fornecedor oculto para consultor e sócio (somente leitura)

- **Severidade:** Baixo (confirmar intenção)
- **Localização:** `app/pages/processos.vue:136-146`.
- **Evidência:**
  ```html
  <div v-if="canWriteProcessos" class="flex shrink-0 items-center gap-2.5">
    <NotificacaoFornecedorBell :processos="processos" />
    ...
  ```
  `canWriteProcessos = canWrite("processos")` → só `operacional` e `administrador`.
- **Impacto:** `consultor` (readonly) e `sócio` (readonly, mas com visão de **todos** os
  processos) nunca veem o sino, mesmo que "acompanhar prazo de fornecedor" pudesse ser útil
  para o sócio. Não é bug de segurança — é decisão de visibilidade.
- **Sugestão de fix (proposta):** se o sócio deve ver os alertas, mover
  `<NotificacaoFornecedorBell>` para fora do `v-if="canWriteProcessos"` (o componente já é
  read-only na prática para quem não pode dar PATCH — o botão "resolver" chamaria a API e
  tomaria 403; nesse caso, esconder só o botão de resolver).

---

## 5. Área 4 — Cobertura de testes E2E (Playwright)

### 5.1 Inventário de specs (P — informativo)

**Unit (`vitest`, `npm run test:unit`, `tests/unit/**/*.spec.ts`) — 5 arquivos, 62 testes, todos passam:**

| Spec | Cobre | Status |
|---|---|---|
| `rbac.spec.ts` | `canReadSection`/`canWriteSection` (4 cargos × 5 seções); helpers (`isRole`, `isRowScopedToOwnConsultor`, `defaultRouteForRole`, `isWriteMethod`, `sectionForApiPath`, `sectionForPageRoute`); `resolveAuthUser` (fallback admin-email, `consultorNome` inválido descartado, role inválido); `parseRoleInput`; `roleAppMetadata` (null órfão); `countAdmins` (paginação) | ✅ passing |
| `prazoFornecedor.spec.ts` | `parseDataBR` + `calcularNotificacoesFornecedor` (todos os ramos de supressão, prazo por fornecedor, ordenação) | ✅ passing |
| `pagamentoExport.spec.ts` | `sanitizeNomeArquivo`/`nomeArquivoPagamento` (acentos, vazio); `copiarImagemParaClipboard` (todos os fallbacks) | ✅ passing |
| `formatInvoiceAmountBR.spec.ts` | normalização de valores colados da PI + round-trip com `parseBrCurrency` | ✅ passing |
| `despachantePixStore.spec.ts` | `get`/`salvar` PIX padrão + override; rejeição de nome/chave inválidos | ✅ passing |

**Integração (`node` puro, `npm run test:integration` → `scripts/integration/run-all.mjs`):**
3 *smoke tests* **contra o Supabase REAL do `.env`** (`prestacao_pacientes`, `follow_up`,
`pagamento_lotes_banco`/`_lancamentos_banco`/`_grupos`). Criam/apagam registros com prefixo
`TESTE_` e conferem no fim que não sobrou lixo. **Não executados nesta auditoria** (exigem
credenciais + tocam no banco de produção — decisão consciente documentada no README dos
scripts). Não rodam em CI sem `.env`.

**E2E (`@playwright/test`, `npm run test:e2e`, `tests/e2e/*.spec.ts`) — 3 arquivos:**

| Spec | Testes | Rodam sempre | Pulados sem credenciais |
|---|---|---|---|
| `auth.spec.ts` | 7 | #1 (rota protegida → `/login`), #7 (service role key não vaza no HTML/estado do Nuxt) | #2–#5 sem `E2E_USER_EMAIL/PASSWORD`; #6 sem `E2E_ADMIN_EMAIL/PASSWORD` |
| `configuracoes.spec.ts` | 11 (aba Contas: acesso, criar/editar/excluir conta, validação de `consultorNome`, cenários anti-lockout (a) 1 admin e (b) 2 admins, self-row com ações liberadas) | nenhum | **suíte inteira** com `test.skip(!hasAdmin)`; #8 (redirect de não-admin) também precisa de `E2E_SOCIO_EMAIL/PASSWORD` |
| `rbac.spec.ts` | 5 (socio lê tudo/sem escrita/POST→403; consultor só Follow-up e só os próprios; operacional escreve Processos+Pagamentos, Patients→403; admin acesso total; auto-promoção via storage não funciona) | nenhum | cada teste com `test.skip` sem as credenciais do cargo (`E2E_{SOCIO,CONSULTOR (+_NOME),OPERACIONAL,ADMIN}_*`) |

**Aposentados (`tests/e2e/_aposentados/*.skip.ts` — NÃO varridos pelo Playwright,
`testMatch **/*.spec.ts`):** `processos.skip.ts`, `pagamentos.skip.ts`,
`notificacaoFornecedor.skip.ts`. Todos escritos para o store file-based e **quebrados desde a
migração para Supabase + RBAC** (não faziam `login()`, e o snapshot/restore de `data/*.json`
virou no-op). Mantidos só como referência; substituídos pelos smoke de integração + unit tests.

### M-05 — Suítes de RBAC e Configurações inteiramente puladas sem env `E2E_*`

- **Severidade:** Médio
- **Localização:** `tests/e2e/configuracoes.spec.ts:175` (`test.skip(!hasAdmin, ...)` no
  `describe`); `tests/e2e/rbac.spec.ts` (5 `test.skip` por cargo);
  `tests/e2e/auth.spec.ts` (#2–#6).
- **Evidência:** sem `E2E_ADMIN_EMAIL/PASSWORD`, `E2E_SOCIO_*`, `E2E_CONSULTOR_*` (+`_NOME`),
  `E2E_OPERACIONAL_*`, `E2E_USER_*`, `npm run test:e2e` executa efetivamente **2 asserções**
  (auth #1 e #7). Não há `.env.test`/fixture documentado nem CI que forneça essas credenciais.
- **Impacto:** na prática o RBAC ponta-a-ponta **não é exercitado em nenhum pipeline
  automático**. A garantia real vem de `tests/unit/rbac.spec.ts` (lógica pura) + revisão
  manual. Uma regressão só no *wiring* (middleware, mapeamento de rota, guard de página)
  passaria despercebida.
- **Sugestão de fix (proposta):** provisionar contas de teste dedicadas num projeto Supabase de
  staging e um CI que injete as env vars; ou um modo *mock* do Supabase Auth para E2E.

### M-06 — Fluxos críticos sem nenhum teste: geração de `.docx`, ciclo completo de pagamento, cálculo de nota cheia

- **Severidade:** Médio
- **Localização / lacunas:**
  - **Geração de `.docx`** (`app/composables/useDocxGenerator.ts`): **zero** testes (unit ou
    E2E). Lógica complexa — escolha de template (`isFarmauroraModeloCompleto`), montagem das
    listas de anexos (`buildRemessasList`/`buildDespachanteList`/`buildTransporteList`),
    *fit* de imagem, placeholders. Nada garante que `doc.render()` não quebra nem que os
    placeholders batem com os `.docx` reais de `public/templates/`.
  - **Ciclo completo de pagamento** (criar lançamento → cotar 3 bancos → escolher banco →
    recálculo de `valorReais` → fechar lote; e criar grupo → status do item → pagar grupo):
    coberto **só** parcialmente pelos smoke de integração (round-trip de persistência). As
    funções puras `montarCotacao` / `calcularTotalReais` / `bancoMaisBarato` /
    `normalizarOpcoes` **não têm unit test**; os E2E de UI de pagamentos foram aposentados.
  - **Cálculo de nota cheia** (`app/utils/calculations.ts`): **sem unit test**, apesar de ser
    a "regra confirmada 3×". `isNotaCheia` / `calculateValorNota` / `calculateImposto`
    mereceriam testes de tabela (limiar `< 0.5`, `alvara <= 0`, os dois ramos de `valorNota`,
    as duas taxas 0.16 / 0.135).
  - **Notificação de fornecedor** — a função pura tem bom unit test; o **componente**
    (`NotificacaoFornecedorBell` — remoção otimista, revert on error, visibilidade por cargo)
    não tem teste.
  - **RBAC por papel** — só E2E (pulado sem env, ver M-05) + unit da política. Nenhum teste
    garante que um endpoint novo sob prefixo não mapeado é negado (ver S-01).
- **Impacto:** as duas áreas de maior risco de cálculo (nota cheia, cotação câmbio) e a
  funcionalidade central de output (`.docx`) podem regredir sem nenhum sinal automático.
- **Sugestão de fix (proposta):** priorizar unit tests baratos e de alto valor para
  `calculations.ts` e `pagamentoCalculations.ts`; um E2E de *smoke* de geração de `.docx`
  (render sem erro + abrir o zip e checar que não sobrou `{placeholder}` não substituído).

### B-11 — `README.md` desatualizado (auth, storage, fórmula, estrutura de pastas)

- **Severidade:** Baixo
- **Localização:** `README.md`.
- **Evidência:**
  - Linha 114: "Autenticação (o painel hoje não tem login ...)" — **há** login/RBAC completo.
  - Linhas 16-17, 66-68, 106: descreve `data/patients.json` como storage — hoje é Supabase (ver S-01).
  - Linhas 22-24: `valor da nota = alvará − custo de importação` — fórmula real tem o caso
    "nota cheia" e soma despesa/transporte (ver P-05).
  - Linhas 90-107: estrutura de pastas lista `pages/index.vue` (não existe; são
    `inicio.vue`/`login.vue`/`prestacao.vue`/`processos.vue`/`pagamentos.vue`/`configuracoes.vue`),
    e cita componentes `CompanyTag` (não existe no repo).
  - Linha 81: lista de placeholders do `.docx` não inclui `taxa_imposto`/`imposto`/`despesa`/
    `transporte`/`anexo_*` que `useDocxGenerator.ts` de fato injeta.
- **Impacto:** onboarding de dev e entendimento de arquitetura/segurança prejudicados.
- **Sugestão de fix (proposta):** reescrever o README refletindo: Supabase Auth + tabelas,
  RBAC por cargo, fórmula atual, estrutura de pastas real, placeholders reais.

### B-12 — E2E sem waits fixos; cenário anti-lockout (b) frágil por estado externo

- **Severidade:** Baixo
- **Evidência:**
  - **Positivo:** nenhum `page.waitForTimeout` / `setTimeout` nos specs E2E. Usam
    `expect(...).toHaveURL/toBeVisible/toHaveCount` (auto-retry do Playwright) e
    `waitUntil: "networkidle"` nas navegações. `playwright.config.ts`: `fullyParallel: false`,
    `workers: 1` (serializado — menos flaky, mais lento). `webServer.timeout: 60_000`.
  - **Frágil:** `configuracoes.spec.ts` cenário (b) faz vários `login()` sequenciais trocando
    de sessão no mesmo `page`, com bloco `finally` de limpeza e `try/catch` aninhado. Se um
    passo do meio falhar, pode deixar `e2e+admin2-*` órfão no Supabase real ou o admin
    original demovido. Depende do nº de admins do projeto via `test.skip` dinâmico (cenário (a)
    exige exatamente 1 admin).
  - `useDocxGenerator.ts:225` usa `setTimeout(() => URL.revokeObjectURL(url), 4000)` — é
    cleanup de blob URL no app, **não** teste; ok.
- **Sugestão de fix (proposta):** isolar os cenários anti-lockout num projeto Supabase de teste
  descartável; ou usar `test.step` + limpeza idempotente por `afterEach` que sempre garante
  "1 admin conhecido, sem `e2e+admin2-*`".

---

## 6. Área 5 — Status de itens conhecidos pendentes

### B-13 — Hidratação SSR em `prestacao.vue` e `processos.vue` — investigação (não corrigido)

- **Severidade:** Baixo/Médio (não reproduzível a partir do código estático)
- **Localização:** `app/pages/prestacao.vue`, `app/pages/processos.vue`, e componentes
  filhos (`SidebarNav.vue`, `PatientTable.vue`, `MonthFilterBar.vue`, `AppSelect.vue`).
- **Constatação do código:**
  - Ambas as páginas buscam dados **só no client** (`onMounted(() => fetchPatients()/fetchProcessos())`),
    com `useState` (SSR-safe). O HTML do SSR sai **sem linhas de tabela / sem cards**, e o 1º
    render do client é igual.
  - O conteúdo dependente de cargo usa o padrão de guarda por ref `mounted`/`ready`
    (`SidebarNav.vue:15-18` + comentário; `configuracoes.vue:14-18`). `useAuth().user` é
    `useState` inicializado como `null`, e `load()` (→ `/api/auth/me`) só roda em
    `authz.global.ts`, que retorna cedo no server (`if (import.meta.server) return`). Logo
    `canWrite("patients")` / `canWrite("processos")` são `false` no SSR **e** no 1º paint do
    client (batem); o form e os botões entram num *update* pós-hidratação.
  - **Não foi encontrada, no código atual, uma fonte determinística de *mismatch*** nessas
    duas páginas.
- **Candidatos residuais a investigar com o dev server rodando** (não reproduzíveis nesta
  auditoria):
  1. Extensão de browser injetando nó no `<body>` (falso positivo clássico de hydration).
  2. `MonthFilterBar` / `groupPatientsByMonth` usam `new Date(patient.createdAt).getMonth()/getFullYear()`
     (`app/utils/monthGroups.ts:41-53`) — dependente de timezone. Hoje inócuo (lista vazia no
     SSR); se algum dia renderizar no SSR, difere entre TZ do server e do client.
  3. `PatientTable.vue` mede altura de card via `ResizeObserver` em `onMounted` e aplica
     `:style="{ maxHeight }"` — cai no fallback `560px` até medir (sem mismatch, mas gera um
     "salto" visível pós-hidratação).
  4. `AppSelect` sem prop `id` → `id="app-select-listbox"` duplicado (ver B-05). A `<ul>` é
     `v-if="open"` (só client) → não causa mismatch de hidratação, só DOM inválido.
- **Sugestão (proposta):** rodar `npm run dev`, abrir `/prestacao` e `/processos` logado e
  capturar a mensagem **exata** de "Hydration node mismatch" no console do browser (ela aponta
  o nó/componente). Sem esse dado, a causa raiz não é confirmável a partir do código — o padrão
  de guarda parece correto e as duas páginas parecem SSR-safe hoje.

### P-11 — Integração NFS-e / Focus NFe: não implementada — confirmado

- **Severidade:** Positivo (status esperado confirmado)
- **Evidência:** `grep -rni "nfs|nfe|focus|nota fiscal"` em `app/ server/ shared/` → nenhuma
  ocorrência. Não há endpoint, composable, client HTTP nem env var. `package.json` não tem SDK
  de NFe. O fluxo de "nota" hoje é só o cálculo (`calculations.ts`) + geração do `.docx` de
  prestação (`useDocxGenerator.ts`).

### P-11b — Integração Google Sheets "Trazer dados": não implementada — confirmado

- **Severidade:** Positivo (status esperado confirmado)
- **Evidência:** `grep -rni "sheet|spreadsheet|gspread|googleapis"` em `app/ server/ shared/` →
  nada além do `<link>` do Google Fonts em `nuxt.config.ts`. Sem botão "Trazer dados", sem
  parser de planilha, sem dependência (`googleapis` / `google-spreadsheet` ausentes de
  `package.json`). Os scripts de importação (`scripts/migration/*`) leem de `data/*.json` e
  `follow-up-source.txt` locais, não do Sheets.

---

## 7. Lista priorizada de próximos passos (por severidade/risco)

| # | ID | Ação proposta | Severidade | Esforço |
|---|---|---|---|---|
| 1 | **S-01** | Corrigir a documentação (auth.ts, nuxt.config, .env.example, README, comentários dos stores) para refletir que Pacientes/Processos/Pagamentos vivem em Supabase Postgres via service role. Avaliar RLS como defesa em profundidade. Mudar o default de `sectionForApiPath` de "permitir com sessão" para "negar". | Alto | M |
| 2 | **M-03** | Fechar o `.gitignore` (`data/*.json`) e remover do disco os JSON de migração já migrados, **antes** de qualquer `git init`. Contêm PII + CPF/CNPJ. | Médio | P |
| 3 | **M-02** | Tirar anexos de `public/` (Supabase Storage privado + signed URL, ou endpoint autenticado `/api`). Mover overrides de PIX para tabela. | Médio | M |
| 4 | **M-06** | Adicionar unit tests para `calculations.ts` (nota cheia) e `pagamentoCalculations.ts` (cotação/invalidação) + smoke de geração de `.docx`. | Médio | M |
| 5 | **M-05** | Provisionar contas de teste em staging + CI que injete `E2E_*` para as suítes de RBAC/Configurações efetivamente rodarem. | Médio | M |
| 6 | **M-04 / B-09** | Decidir se o servidor deve validar a transição de status de item (NAO_PAGO↔COMPLEMENTO) e alinhar o comentário de `Pagamento.ts:31`. | Médio | P |
| 7 | **M-01** | `PatientForm.vue` deve importar `CONSULTORES` do `#shared`; adicionar teste de "listas paralelas iguais" (consultores, fornecedores, despachantes). | Médio | P |
| 8 | **B-04** | Script `npm run typecheck` (`vue-tsc --noEmit`) + rodar em CI junto com `vitest run`. | Baixo | P |
| 9 | **B-06** | Adicionar row-scoping de `consultor` também em `processos/[id].patch.ts` e `[id].delete.ts` (à prova de mudança futura da política de escrita). | Baixo | P |
| 10 | **B-11** | Reescrever o `README.md` (auth, storage, fórmula, estrutura, placeholders). | Baixo | P |
| 11 | **B-07** | Decidir sobre self-delete de admin com pares (desabilitar no client?) e tratar a corrida de `countAdmins` (recontar pós-escrita). | Baixo | P |
| 12 | **B-08** | Após todas as contas admin terem `app_metadata.role`, remover o fallback admin-email de `resolveAuthUser`. | Baixo | P |
| 13 | **B-03** | Confirmar o nome público correto ("Farmaurora" vs "Farmauropa"). | Baixo | P |
| 14 | **B-10** | Confirmar se o sino de alerta de fornecedor deve aparecer para o sócio. | Baixo | P |
| 15 | **B-05** | Tornar `id` obrigatório em `AppSelect` (ou sufixo estável via `useId()`). | Baixo | P |
| 16 | **B-13** | Reproduzir o warning de hidratação com `npm run dev` e capturar o nó exato antes de mexer. | Baixo | P–M |
| 17 | **B-12** | Isolar os cenários anti-lockout num projeto Supabase descartável. | Baixo | P |
| 18 | **B-02** | Apontar `NUXT_ADMIN_EMAILS` de produção para e-mail real (resolver o TODO do `.env`). | Baixo | P |

> **P** = pequeno (horas) · **M** = médio (1–3 dias).

---

## Apêndice — o que foi verificado como OK (sem achado)

- `vue-tsc --noEmit` limpo na raiz e nos 4 project references; `vitest run` 62/62 verde.
- Sem `console.log`/`debugger`/`TODO`/`FIXME` em `app/`, `server/`, `shared/`.
- RBAC server aplicado em toda request `/api/**`; consultor row-scoped na query (não só na UI);
  auto-promoção via localStorage/cookie não funciona (server usa o JWT assinado).
- Service role key server-only; não aparece no bundle/HTML (teste E2E dedicado).
- `consultorNome` limpo com `null` explícito no `app_metadata`.
- Path traversal em anexos mitigado (`SAFE_ATTACHMENT_KEY` em `patientId` e `slotKey`).
- Cotação Câmbio: `totalMoeda * taxa + taxaCorretagem`, idêntico para XP/Rendimento/Intex.
- Invalidação de cotação preserva `taxaCorretagem`; zera taxas cotadas e `valorReais`.
- Pagamento sempre em nível de grupo/lote; endpoints despachante/transportadora simétricos.
- `totalMoeda`/`valorMoeda` (não `totalDolares`) — suporte USD + EUR consistente.
- Notificação de fornecedor: prazos por fornecedor, supressão por `aberturaThread` /
  `alertaFornecedorResolvido`, parse defensivo de data — cobertos por unit test.
- NFS-e/Focus NFe e Google Sheets "Trazer dados": não implementados (status esperado).
```
