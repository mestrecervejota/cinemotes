# Cinemotes

Extensão para Chrome e Firefox que integra emotes do **BetterTTV (BTTV)**,
**FrankerFaceZ (FFZ)** e **7TV** ao chat da [Cinefy](https://cinefy.gg),
junto dos emotes nativos da plataforma.

## Índice

-   [Sobre o projeto](#sobre-o-projeto)
-   [Funcionalidades](#funcionalidades)
-   [Instalação](#instalação)
-   [Como funciona](#como-funciona)
-   [Estrutura do projeto](#estrutura-do-projeto)
-   [Limitações conhecidas](#limitações-conhecidas)
-   [Roadmap](#roadmap)
-   [Privacidade](#privacidade)
-   [Contribuições](#contribuições)
-   [Licença](#licença)

## Sobre o projeto

A Cinefy tem seu próprio sistema de emotes, mas quem vem da Twitch pode
sentir falta dos catálogos do BTTV, FFZ e 7TV. A Cinemotes integra esses
três catálogos diretamente ao chat, com autocomplete, menu de emotes e
prioridades configuráveis.

O projeto foi desenvolvido sem frameworks e sem etapa de build. É
JavaScript puro, executado por meio de um service worker Manifest V3 e
content scripts.

## Funcionalidades

-   **Emotes no chat:** reconhece automaticamente códigos do BTTV, FFZ,
    7TV e Cinefy nas mensagens.
-   **Autocomplete:** digite `:` seguido de texto para abrir uma lista
    de emotes dos quatro providers. A busca filtra por prefixo ou
    substring; navegue com `↑` e `↓` e confirme com `Enter` ou `Tab`.
-   **Menu de emotes:** botão integrado à barra de entrada do chat, com
    abas por provider, busca em tempo real e grade compacta.
-   **Emotes recentes:** mantém os últimos emotes usados na aba
    **Recentes**.
-   **Tooltip:** exibe uma prévia do emote, o nome, o provider e o
    escopo ao passar o mouse.
-   **Prioridade de emotes:** emotes do canal têm prioridade sobre os
    globais. Dentro do mesmo escopo, a ordem é **BTTV → FFZ → 7TV →
    Cinefy**.
-   **Cache:** armazena resultados das APIs em `chrome.storage.local` e
    `chrome.storage.session`, ajudando a preservar os dados entre
    reinicializações do service worker do Manifest V3.

## Instalação

Baixe o ZIP do repositório e extraia os arquivos, ou clone o repositório.
Não é necessário instalar Node.js, dependências ou executar build: cada
pasta contém uma extensão completa.

### Chrome

1. Abra `chrome://extensions`.
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta **`chrome/`**, que contém o manifest do Chrome.
5. Abra uma live em [cinefy.gg](https://cinefy.gg) e deixe o chat visível.

Se a extensão antiga estava carregada pela raiz do projeto, remova essa
entrada antes de carregar a pasta `chrome/`.

### Firefox

Requer **Firefox para desktop 140 ou superior**.

1. Abra `about:debugging#/runtime/this-firefox` na barra de endereços.
2. Clique em **Carregar extensão temporária…**. Dependendo do idioma,
   o botão pode aparecer como **Load Temporary Add-on…**.
3. Entre na pasta **`firefox/`** e selecione **`manifest.json`**.
4. Abra uma live em [cinefy.gg](https://cinefy.gg) e deixe o chat visível.
5. Caso o Firefox solicite permissões de acesso ao site, conceda-as.
6. Para conferir o autocomplete, digite `:kap` no campo de mensagem.

**A instalação no Firefox é temporária e destinada aos testes.** Ao fechar
ou reiniciar o navegador, a extensão é removida. Sempre que abrir o Firefox
novamente, será necessário repetir os passos acima para reinstalá-la.

### Publicação futura nas lojas oficiais

As versões atuais são instaladas manualmente para testes. Futuramente,
a Cinemotes será publicada na **Chrome Web Store** e no **Firefox Add-ons
(AMO)**, as lojas oficiais dos respectivos navegadores.

Após a publicação, será possível instalar a extensão diretamente pela
loja e mantê-la instalada ao fechar e reabrir o navegador, sem repetir a
instalação temporária. Os links serão adicionados a este README quando
as versões estiverem disponíveis.

### Atualizar após alterações

- **Chrome:** em `chrome://extensions`, clique no botão de recarregar da
  Cinemotes e depois atualize a página da live.
- **Firefox:** em `about:debugging#/runtime/this-firefox`, clique em
  **Recarregar** na Cinemotes e depois atualize a página da live.

Edite os arquivos da pasta do navegador correspondente. Por enquanto,
melhorias comuns precisam ser aplicadas às duas versões manualmente.

> A extensão depende da estrutura interna do chat do Cinefy. Mudanças
> no site podem afetar seu funcionamento.

## Como funciona

A extensão é organizada em três camadas:

### 1. Service worker --- `background.js`

Faz as chamadas às APIs do BTTV, FFZ e 7TV. Resolve a relação
`username → channelId` da Twitch usando `decapi.me`, com `api.ivr.fi`
como alternativa. Mantém os resultados em cache na memória, em
`chrome.storage.local` e em `chrome.storage.session`.

### 2. Main world --- `main-world.js`

Executa no contexto da página da Cinefy para observar `fetch` e
`XMLHttpRequest`. Não altera as respostas: observa as requisições que o
React da Cinefy já faz e retransmite os dados por `postMessage`. Assim,
a extensão consegue identificar os emotes nativos sem precisar de um
token de autenticação.

### 3. Content scripts --- `content/*.js`

É onde ocorre a maior parte do processamento: trie de códigos de emote,
parser que substitui nós de texto por imagens, fila de parsing com
deadline, autocomplete, menu, tooltip e observer do chat virtualizado.

## Estrutura do projeto

- **chrome/**: manifest Chrome, background.js (service worker), main-world.js,
  styles.css, assets/ e content/.
- **firefox/**: manifest Firefox, background.js (scripts de background),
  main-world.js, styles.css, assets/ e content/.
- **README.md**: instru??es das duas vers?es.

C?digo e imagens foram duplicados intencionalmente para permitir instala??o
sem ferramentas. Nenhuma extens?o cont?m a outra. Cada pasta tem seu
pr?prio manifest.json e assets/. Os arquivos content.js antigos foram
preservados, mas n?o s?o carregados pelo manifest. O m?dulo
content/12-message-history.js tamb?m permanece fora do carregamento atual.

A ordem de content scripts em cada manifest importa.

Refer?ncias Firefox:
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/


