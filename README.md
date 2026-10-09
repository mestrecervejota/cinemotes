# Cinemotes

Extensão para Chrome que integra emotes do **BetterTTV (BTTV)**,
**FrankerFaceZ (FFZ)** e \*\*7TV ao chat da [Cinefy](https://cinefy.gg),
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

A Cinemotes ainda é instalada manualmente, em modo de desenvolvedor.

1.  Baixe o ZIP do repositório e extraia os arquivos, ou clone o
    repositório.
2.  Abra `chrome://extensions` no Chrome. Navegadores baseados em
    Chromium, como Brave, Edge e Opera, também podem funcionar.
3.  Ative o **Modo do desenvolvedor**.
4.  Clique em **Carregar sem compactação**.
5.  Selecione a pasta do projeto que contém o arquivo `manifest.json`.
6.  Abra o chat de um canal em [cinefy.gg](https://cinefy.gg).

> **Observação:** como a extensão depende da estrutura interna do chat
> da Cinefy, mudanças no site podem afetar seu funcionamento.

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
- **legacy/**: refer?ncia antiga, n?o utilizada e mantida intacta.
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


