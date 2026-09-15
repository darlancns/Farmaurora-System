# Especificação — Página "Recados"

Mural de comunicação interna do Farmaurora CRM. Permite que diferentes cargos troquem avisos entre si (públicos, por cargo ou pessoa) e mantenham lembretes pessoais privados. Também introduz um sistema de notificações global que substitui/absorve o sino atual de Processos.

---

## 1. Visão geral das abas

| Aba | Conteúdo |
|---|---|
| **Todos** | Recados públicos + recados direcionados ao meu cargo + recados direcionados a mim + recados que eu criei |
| **Recebidos** | Igual a "Todos", excluindo o que eu mesmo criei |
| **Enviados** | Só os recados que eu criei (qualquer destinatário) |
| **Meus** | Lembretes pessoais e privados — nunca visíveis a outra conta |

Filtros de tipo (cor) funcionam como chips que cruzam todas as abas, incluindo Meus — não são abas separadas. Não existe filtro de "não lido" na listagem.

## 2. Tipos de recado (cor)

- 🔴 **Urgente**
- 🟡 **Atenção**
- 🔵 **Informação**
- ⚪ **Geral**

## 3. Destinatário (ao criar um recado no mural compartilhado)

- **Público** — visível a todas as contas
- **Cargo** — visível a todas as contas com aquele cargo (mesmo enum de role já usado no RBAC: Consultor, Sócio, Operacional ou Administrador)
- **Pessoa específica** — visível só ao destinatário escolhido

"Meus" (lembretes pessoais) não tem destinatário — é sempre privado à própria conta.

### Seleção de destinatário na criação do recado

- **Cargo:** lista fixa dos 4 valores do enum de role (Consultor, Sócio, Operacional, Administrador) — não depende de consulta ao banco.
- **Pessoa específica:** precisa de um campo de busca/seleção listando todas as contas cadastradas no Supabase (pelo menos `id`, `nome` e `cargo` de cada uma), pra escolher o destinatário exato. **Isso é infraestrutura nova** — os seletores existentes no CRM (Despachante, Transportadora, Consultor) são listas fixas/hardcoded de classificação dentro de um Processo, não uma consulta às contas reais autenticadas no Supabase. Vai ser necessário um endpoint novo (ex: `GET /api/contas`) que devolva as contas do projeto pra alimentar esse seletor.

> ⚠️ **Achado:** hoje não existe nome genérico de conta. Só existe `app_metadata.consultorNome` (restrito ao cargo Consultor, validado contra os 7 valores fixos de `CONSULTORES`) e o e-mail, que é o único identificador pra Sócio/Operacional/Administrador. Isso afeta como o seletor (e os cards de Recados, que mostram autor/destinatário) exibem "quem é quem" — ver decisão na seção 11.
> **Resolvido:** campo `nome` genérico já foi implementado em `app_metadata` (obrigatório na criação de conta, opcional em contas antigas até edição manual).
>
> **RBAC do endpoint:** `GET /api/contas` deve entrar na mesma Section nova `recados` do RBAC (`READ_ACCESS.recados = ROLES`, todos os cargos) — em vez de criar um mecanismo separado tipo "AUTHENTICATED_ANY_API_PREFIXES". Mantém tudo dentro do padrão tabela-driven existente em `shared/utils/rbac.ts`.
>
> **Nome do composable:** o composable novo pro seletor (leitura enxuta: id/nome/cargo) deve se chamar `useContasSelecao.ts`, pra não colidir com o `useContas.ts` já existente (CRUD completo de contas, usado no admin).

## 4. Permissões

- **Criar recado (mural compartilhado):** qualquer cargo pode criar — Consultor e Sócio, que hoje são read-only no resto do CRM, têm escrita aqui. É uma exceção explícita ao RBAC geral, deve ser tratada como uma permissão própria (ex: `canWriteRecados = true` pra todos os roles) e não herdar `canWriteProcessos`/`canWritePagamentos`.
- **Editar/apagar:** só o autor do recado, e só o próprio recado. Apagar é exclusão definitiva (hard delete, sem soft delete). Editar reenvia notificação aos mesmos destinatários originais.
- **Lembretes pessoais (Meus):** só o dono vê e edita, sem exceção de cargo.

## 5. Fixar (pin)

- Individual por conta — cada usuário decide quais recados fixar pra si, sem afetar a visualização de ninguém mais.
- Aplica-se tanto ao mural compartilhado quanto a "Meus".
- Implementação: tabela de junção usuário↔recado (ver modelo de dados).

## 6. Concluir (check)

- Qualquer recado do mural compartilhado — público, de cargo ou de pessoa — pode ser marcado como "concluído" por qualquer pessoa que o veja.
- É uma marcação **individual por pessoa**, não um status global do recado. Ex: um recado de cargo pra "Operacional" — cada pessoa do cargo marca (ou não) por conta própria, independente das outras.
- Ao marcar, o recado some das abas Todos/Recebidos **só de quem concluiu** — continua existindo normalmente pros demais destinatários (cargo/público) até eles também concluírem. Não existe histórico de quem concluiu, em nenhuma tela.
- É uma ação **final e irreversível** — não pode ser desmarcada depois de confirmada.
- Ao marcar, dispara notificação pro autor original do recado, identificando **qual** recado foi concluído.
- Modal de confirmação ao clicar no check: **"Marcar recado como concluído?"** com o título do recado exibido, e botão de confirmar.
- Mensagem de notificação pro autor: **"{Nome} concluiu o recado "{título}" que você enviou."**

## 7. Sistema de notificações (sino global)

### Situação atual
O sino existente (`NotificacaoFornecedorBell.vue`, em `processos.vue`, visível só quando `canWriteProcessos`) é um painel de alertas de SLA de fornecedor, **calculado on-the-fly** a partir dos dados de `processos` (data da compra + prazo tabelado por fornecedor) — não existe uma notificação "gravada" no banco pra isso.

### Proposta
Não forçar os dois sistemas pra dentro de uma tabela única agora (naturezas diferentes: um é calculado, outro é evento gravado). Em vez disso:

- Criar um componente de sino **global**, usado no cabeçalho de **todas** as páginas, sempre na mesma posição.
- Ele agrega duas fontes por baixo do capô:
  1. Alertas de Fornecedor — mantém a lógica atual (`calcularNotificacoesFornecedor`), só aparece se `canWriteProcessos`.
  2. Notificações de Recados — nova tabela `notificacoes`, aparece pra todo mundo.
- Badge e dropdown somam as duas fontes visualmente, mas o cálculo/fonte de cada uma continua isolado.
- Migração futura pra uma tabela `notificacoes` genérica (incluindo Fornecedor) fica em aberto, não bloqueia esta entrega.

> ⚠️ **Achado (investigação):** hoje não existe um cabeçalho global — `DefaultLayout.vue` só tem `SidebarNav` + `<slot>` + `ToastNotice`; cada página desenha seu próprio header. "Sino sempre no mesmo lugar em todas as páginas" implica criar uma faixa de cabeçalho global no layout (mudança estrutural que toca todas as páginas), ou fixar o sino fora do fluxo normal (`position: fixed`). Decisão de desenho a ser fechada quando começar a Fase C (sino global) — não bloqueia as Fases A/B (banco + backend).

### Eventos que geram notificação de Recados
- Recado novo direcionado a mim (pessoa) → notifica a pessoa
- Recado novo direcionado ao meu cargo → notifica todas as contas daquele cargo
- Recado novo público → notifica todas as contas
- Recado concluído por alguém → notifica o autor original, citando o título do recado
- Recado editado pelo autor → reenvia notificação aos mesmos destinatários originais

### Templates de mensagem sugeridos
- Direcionado (pessoa): `"{Autor} te enviou um recado: "{título}""`
- Direcionado (cargo): `"{Autor} enviou um recado pro seu cargo: "{título}""`
- Público: `"{Autor} publicou um recado: "{título}""`
- Conclusão: `"{Nome} concluiu o recado "{título}" que você enviou."`

O campo "lida/não lida" existe **só na notificação**, pra controlar o contador do sino — não tem relação com o filtro de "não lido" da listagem de Recados (que foi descartado).

## 8. Modelo de dados (proposta)

> Nota: o projeto usa `id` como `text` gerado via `randomId()` (`server/utils/storeKit.ts`), não `uuid` nativo do Postgres. As tabelas abaixo usam "uuid" só como notação simplificada — na implementação, seguir o padrão real do projeto (`id text`, `created_at timestamptz default now()`, acesso via `XStore.ts` + `XMappers.ts`).

**`recados`**
| Campo | Tipo | Observação |
|---|---|---|
| id | uuid, pk | |
| autor_id | fk auth.users | |
| titulo | text | |
| mensagem | text | |
| tipo | enum: urgente, atencao, informacao, geral | |
| destinatario_tipo | enum: publico, cargo, pessoa | |
| destinatario_cargo | enum role, nullable | preenchido só quando destinatario_tipo = cargo |
| destinatario_pessoa_id | fk auth.users, nullable | preenchido só quando destinatario_tipo = pessoa |
| created_at | timestamp | |
| updated_at | timestamp | |

**`recados_fixados`** (fixar, individual por conta)
| Campo | Tipo |
|---|---|
| usuario_id | fk auth.users |
| recado_id | fk recados |
| created_at | timestamp |

Chave primária composta (usuario_id, recado_id).

**`recados_concluidos`** (check, individual por conta — usada só pra filtrar o recado da tela de quem concluiu; não é exibida como histórico em nenhum lugar)
| Campo | Tipo |
|---|---|
| usuario_id | fk auth.users |
| recado_id | fk recados |
| concluido_em | timestamp |

Chave primária composta (usuario_id, recado_id). Ao existir uma linha aqui, o recado deixa de aparecer nas abas Todos/Recebidos daquele usuário — os outros destinatários (cargo/público) continuam vendo normalmente.

**`lembretes_pessoais`** (aba "Meus" — tabela separada de `recados` porque não tem destinatário, notificação ou lógica de cargo; é sempre privada e de uso individual)
| Campo | Tipo |
|---|---|
| id | uuid, pk |
| usuario_id | fk auth.users |
| titulo | text |
| mensagem | text |
| tipo | enum: urgente, atencao, informacao, geral |
| fixado | boolean | próprio campo, não precisa de tabela de junção (já é individual por natureza) |
| concluido | boolean | idem |
| created_at | timestamp |
| updated_at | timestamp |

**`notificacoes`**
| Campo | Tipo | Observação |
|---|---|---|
| id | uuid, pk | |
| destinatario_id | fk auth.users | |
| tipo | enum: recado_novo, recado_concluido | (deixar aberto pra incluir fornecedor_atraso no futuro) |
| recado_id | fk recados, nullable | |
| mensagem | text | texto já pronto, gerado no momento da criação |
| lida | boolean, default false | controla o badge do sino |
| created_at | timestamp | |

## 9. Fluxo de exemplo

1. Darlan cria um recado direcionado à Rebeca: "Confirmar recebimento do lote X".
2. Sistema grava em `recados` (destinatario_tipo = pessoa, destinatario_pessoa_id = Rebeca) e cria uma linha em `notificacoes` pra Rebeca: *"Darlan te enviou um recado: "Confirmar recebimento do lote X""*.
3. Rebeca vê o recado na aba Recebidos, resolve a tarefa e clica no check → modal de confirmação → confirma.
4. Sistema grava em `recados_concluidos` (usuario_id = Rebeca, recado_id = X) e cria notificação pro Darlan: *"Rebeca concluiu o recado "Confirmar recebimento do lote X" que você enviou."*

## 11. Decisão — nome genérico de conta

**Decidido: opção A.** Toda conta (não só Consultor) vai ter um nome genérico gravado — provavelmente um novo campo em `app_metadata` (ex: `nome`), preenchido na criação/edição da conta em `/configuracoes`.

Isso é um **pré-requisito** a ser resolvido **antes** de começar a implementação de Recados — não faz parte do escopo desta spec, mas bloqueia o início dela. Pontos a decidir nessa frente (fora do escopo deste documento):
- Nome do campo novo em `app_metadata` e onde ele é lido/exposto (`AuthUser`, `AdminUserSummary`, `useAuth`).
- Relação com `consultorNome`: campo novo substitui/unifica com ele pros Consultores, ou os dois convivem em paralelo (nome genérico pra exibição, `consultorNome` mantido só pela validação própria contra a lista fixa de 7 nomes)?
- Backfill: contas já existentes precisam ganhar um nome retroativamente — via tela de edição em `/configuracoes` ou script de migração.

## 12. Status

Recados em si está com a spec fechada. Falta implementar o pré-requisito da seção 11 antes de iniciar esta página.
