# Migração do clipboard e atualização do Electron

**Data:** 2026-11-06
**Repositório:** `japReader`
**Workspace:** worktree isolado `node-package-updates`
**Estado:** desenho aprovado em conversa; implementação ainda não iniciada

## Contexto

O japReader usa Electron `41.10.7`, Electron Forge `7.11.2` e Node.js
`24.22.1` para desenvolvimento, testes e empacotamento. O Electron 41 chegou ao
fim do suporte em 24 de agosto de 2026, enquanto o Electron 45 é a linha estável
mais recente no momento deste desenho.

O monitoramento do clipboard é essencial ao produto. Atualmente, uma
`BrowserWindow` invisível carrega `src/boxes/clipboard/script.js` como preload.
Esse script usa `clipboard-event` para detectar mudanças, lê o conteúdo com
`electron.clipboard.readText()`, estabiliza leituras divergentes, normaliza o
texto, filtra conteúdo japonês, suprime duplicatas e publica eventos IPC para
análise, DeepL e notificação do Reader.

Esse desenho não é compatível diretamente com Electron 44. Nessa versão, o
módulo `clipboard` deixa de estar disponível em processos renderer e
`clipboard.readText()` passa de síncrono para assíncrono. Por isso, a atualização
do Electron deve ser precedida por uma migração do monitor para o processo
principal, ainda no Electron 41.

Separadamente, a migração do Node de build para 26 está bloqueada. O maker ZIP
estável do Electron Forge ainda usa `cross-zip`, cujo caminho recursivo baseado
em `fs.rmdir` é incompatível com Node 26. Há trabalho upstream aberto no Forge,
mas nenhuma versão estável com a correção foi publicada até a data deste
desenho.

## Relação com o desenho anterior

Este documento refina a ordem das fases descritas em
`2026-10-29-node-package-modernization-design.md`:

1. migrar e validar o clipboard no Electron 41;
2. atualizar e validar o Electron até a linha 45;
3. manter Node `24.22.1` enquanto o maker ZIP não for compatível;
4. planejar a migração para Node 26 somente depois da correção upstream estável.

Os princípios anteriores de testes de caracterização, validação manual antes de
commits de produto e separação entre testes, empacotamento e runtime continuam
válidos.

## Objetivos

- Preservar o comportamento observável do clipboard em um serviço independente
  de renderer.
- Comprovar o novo monitor no Electron 41 antes de alterar o runtime Electron.
- Atualizar o Electron para a linha estável 45 sem alterar o Node de build.
- Manter o processo de distribuição funcional em Windows x64.
- Evitar patches locais em `cross-zip`, makers customizados ou alterações em
  `node_modules`.
- Definir critérios objetivos para desbloquear futuramente o Node 26.

## Fora de escopo

- Suporte a Windows de 32 bits.
- Migrar CommonJS para ESM.
- Redesenhar os demais preloads ou eliminar `nodeIntegration` globalmente.
- Alterar contratos de análise, seleção entre API local e ichi.moe, objetos do
  Reader ou formatos persistidos.
- Introduzir polling, retry ou fallback automático para o clipboard.
- Atualizar o Electron Forge sem incompatibilidade comprovada com o Electron 45.
- Migrar o Node de build para 26 nesta implementação.
- Aplicar `patch-package`, overrides ou forks para contornar `cross-zip`.

## Estado final pretendido

Ao final das duas partes:

- o clipboard será monitorado pelo processo principal;
- a janela invisível `clipboardBox` não existirá mais;
- o helper `clipboard-event-handler-win32.exe` terá início e encerramento
  controlados pela aplicação;
- Electron estará na última versão patch aprovada da linha 45;
- Node de build continuará fixado em `24.22.1`;
- Forge permanecerá em `7.11.2`, salvo necessidade incompatível descoberta e
  aprovada separadamente;
- instalação limpa, testes, `package`, `make` e validação manual estarão
  aprovados em Windows x64.

## Parte 1 — Serviço de clipboard no processo principal

### Arquitetura

Será criado um serviço pequeno e injetável, denominado conceitualmente
`ClipboardMonitor`. Ele será proprietário de:

- inscrição no evento `change` de `clipboard-event`;
- leitura do texto pelo módulo `clipboard` do processo principal;
- estabilização de leituras vazias ou divergentes;
- normalização do texto;
- filtro de conteúdo japonês;
- supressão de duplicatas;
- início e encerramento do listener nativo.

O serviço exporá `start()` e `dispose()` idempotentes e receberá suas dependências
por parâmetro. Os testes poderão fornecer um listener e um leitor falsos, sem
abrir Electron, acessar o clipboard real ou iniciar o executável auxiliar.

O `src/index.js` continuará sendo a raiz de composição. Ele criará uma única
instância do monitor depois de `app.whenReady()` e distribuirá textos aceitos
para os consumidores existentes.

### Fluxo de dados

```text
clipboard-event
    -> ClipboardMonitor
    -> leituras estabilizadas
    -> normalização
    -> filtro japonês
    -> deduplicação
    -> dispatcher do processo principal
       -> coordenador de análise
       -> DeepL, quando habilitado
       -> notificação visual do Reader
```

O texto entregue aos consumidores continuará tendo o mesmo formato atual. A
política API local versus ichi.moe, latest-request-wins, payloads do DeepL e
notificação do Reader não serão alterados.

Os canais IPC já consumidos pelas janelas permanecerão estáveis. O canal
`clipboardChanged` poderá ser preservado como compatibilidade interna durante a
migração, mas o novo monitor não dependerá de um renderer para produzi-lo.

### Estabilização e normalização

O algoritmo atual será preservado:

1. realizar uma leitura inicial e duas leituras de confirmação;
2. se houver valor vazio ou divergência, realizar 11 leituras;
3. selecionar o valor majoritário;
4. remover espaços externos e os símbolos atualmente descartados;
5. converter dígitos ASCII em dígitos de largura completa;
6. aceitar somente textos com caracteres japoneses reconhecidos;
7. não publicar novamente o último texto aceito.

Qualquer desempate manterá a semântica observável do algoritmo atual; não será
introduzida uma nova política de preferência.

### Compatibilidade síncrona e assíncrona

No Electron 41, `clipboard.readText()` retorna uma string. No Electron 44 e
superior, retorna uma `Promise`. O monitor tratará os dois contratos por uma
fronteira assíncrona equivalente a:

```js
const text = await Promise.resolve(readText());
```

Somente uma sequência de estabilização poderá executar por vez. Se um evento
ocorrer enquanto houver leituras em andamento, o monitor marcará trabalho
pendente e realizará uma nova sequência ao terminar. Isso impede leituras
concorrentes e resultados fora de ordem sem perder o estado final do clipboard.

### Ciclo de vida

- `start()` será chamado uma vez depois de `app.whenReady()`.
- Recriação de janelas não iniciará outra instância do helper.
- `dispose()` removerá listeners e chamará `clipboard-event.stopListening()`.
- O encerramento ocorrerá no fluxo explícito de saída e em `before-quit`.
- Chamadas repetidas de `start()` e `dispose()` serão seguras.
- Depois da comprovação do novo serviço, `clipboardBox`, seu HTML e seu preload
  deixarão de participar do runtime.

### Tratamento de falhas

Falhas ao iniciar o listener, ler o clipboard ou detectar encerramento
inesperado do helper serão registradas explicitamente. Esta parte não adicionará
retry, polling nem fallback automático. Uma estratégia de fallback exigirá um
desenho e testes próprios.

Uma falha não poderá deixar uma rejeição assíncrona não tratada nem iniciar um
segundo helper. O monitor continuará descartável mesmo depois de falha parcial
na inicialização.

## Testes da Parte 1

Os testes serão escritos antes da mudança protegida e cobrirão:

- normalização de espaços, símbolos e dígitos;
- aceitação de texto japonês e rejeição de texto vazio ou não japonês;
- supressão de duplicatas;
- caminho de três leituras estáveis;
- caminho de 11 leituras após vazio ou divergência;
- escolha majoritária, incluindo a semântica atual de empate;
- leitores síncronos e assíncronos;
- evento recebido durante uma sequência assíncrona;
- ausência de sequências concorrentes;
- `start()` e `dispose()` idempotentes;
- remoção de listeners e encerramento do helper;
- distribuição para análise, DeepL e notificação;
- preservação de análise e notificação com DeepL desabilitado.

Os gates automatizados da Parte 1 serão:

- testes focados do monitor;
- testes de integração da composição Electron;
- `npm test` completo;
- Prettier explícito nos arquivos alterados;
- `git diff --check`;
- `npm run package`;
- `npm run make` com Node `24.22.1`.

### Validação manual da Parte 1

No aplicativo empacotado em Windows x64:

- copiar texto japonês simples;
- copiar rapidamente vários textos diferentes;
- copiar repetidamente o mesmo texto;
- copiar texto vazio e texto não japonês;
- validar a notificação do Reader;
- validar análise pela API local;
- validar ichi.moe quando habilitado;
- validar DeepL habilitado e desabilitado;
- encerrar e confirmar que não restou
  `clipboard-event-handler-win32.exe`;
- reiniciar e confirmar que há somente um monitor.

A Parte 1 somente poderá receber um commit de produto depois dessa validação
manual e de autorização explícita.

## Parte 2 — Atualização do Electron

A Parte 2 só começará depois do commit aprovado da Parte 1. Node permanecerá em
`24.22.1` durante toda a atualização.

### Progressão por major

Cada linha será instalada no último patch disponível e validada antes da
seguinte:

1. Electron 42;
2. Electron 43;
3. Electron 44;
4. Electron 45.

Os majors intermediários são checkpoints de diagnóstico; o resultado final não
precisa manter commits permanentes para versões intermediárias. Uma falha
interromperá a progressão e será atribuída antes de instalar o próximo major.

Antes de cada passo, serão revisadas as breaking changes oficiais e pesquisados
os usos correspondentes no repositório. Não serão feitas adaptações preventivas
sem um uso afetado ou um teste que demonstre a necessidade.

### Pontos específicos de compatibilidade

- Electron 44 exige Windows x64 ou arm64; o produto assumirá Windows x64.
- O acesso ao clipboard já estará no processo principal.
- O monitor já aceitará o `readText()` assíncrono introduzido no Electron 44.
- Electron 45 altera preloads sandboxed; os preloads, `BrowserWindow`,
  `webPreferences`, IPC, navegação e janelas auxiliares serão auditados e
  testados.
- O Node embutido no Electron é distinto do Node usado por npm e Forge. A
  atualização do Electron não altera os pins de Node do repositório.

### Gates por major

Em cada major:

- instalação reproduzível e revisão do lockfile;
- testes focados relevantes;
- `npm test`;
- Prettier e `git diff --check`;
- `npm run package`;
- `npm run make`;
- inspeção dos artefatos em `out/make/`;
- execução limitada do aplicativo quando necessária para atribuir uma mudança
  de runtime.

Depois do Electron 45, a validação manual completa incluirá clipboard, Reader,
API local, ichi.moe opcional, DeepL, dicionário, tradução, opções, persistência e
ciclo de vida das janelas. O commit final dependerá da aprovação manual.

## Node 26 — Gate futuro

Node 26 não faz parte das Partes 1 ou 2. A migração só poderá ser planejada quando
uma versão estável do Electron Forge ou do maker ZIP:

- não usar o caminho incompatível de `cross-zip`; ou
- publicar uma correção upstream equivalente e suportada.

O desbloqueio exige, sem patch local:

- instalação limpa com Node 26;
- preflight atualizado de forma atômica;
- testes focados e suíte completa;
- `npm run package`;
- `npm run make` produzindo os artefatos Windows esperados;
- ausência de `DEP0147` e `DEP0187` no caminho de build;
- validação manual do aplicativo empacotado.

Uma PR aberta, branch de desenvolvimento ou versão prerelease não é suficiente
para remover o bloqueio. A versão estável deverá ser verificada novamente no
momento do planejamento.

## Commits e rollback

- O documento de desenho pode ser versionado antes da implementação.
- A Parte 1 e a Parte 2 terão diffs e validações independentes.
- Nenhum commit de produto será criado antes da validação manual e autorização
  explícita da respectiva parte.
- Em falha, serão revertidos somente os arquivos da parte ainda não aprovada.
- `node_modules/` e `out/` não serão editados nem versionados.
- Alterações não relacionadas presentes no worktree serão preservadas.
- Falhas de rede, permissão ou download serão separadas de regressões do
  produto.

## Critérios de conclusão

### Parte 1

- monitor executa no processo principal no Electron 41;
- comportamento atual está protegido por testes;
- clipboard real funciona no aplicativo empacotado;
- helper encerra com o aplicativo;
- janela invisível de clipboard foi removida;
- testes, `package` e `make` passam com Node `24.22.1`;
- validação manual e commit foram autorizados.

### Parte 2

- Electron 45 está instalado em versão patch aprovada;
- não há mudança nos pins do Node de build;
- clipboard assíncrono funciona sem concorrência ou perda do estado final;
- preloads, IPC, janelas e integrações mantêm o comportamento esperado;
- testes, `package` e `make` passam;
- artefatos Windows x64 são produzidos;
- validação manual e commit foram autorizados.

### Node 26

- permanece explicitamente bloqueado até uma correção upstream estável do
  caminho ZIP e uma nova rodada de planejamento.

## Referências

- [Calendário e suporte do Electron](https://releases.electronjs.org/schedule)
- [Electron 44 e migração do clipboard](https://www.electronjs.org/blog/electron-44-0)
- [Electron 45](https://www.electronjs.org/blog/electron-45-0)
- [PR do Forge para compatibilidade do maker ZIP com Node 26](https://github.com/electron/forge/pull/4468)
