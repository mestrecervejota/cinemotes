# Cinemotes

Extensão do Chrome que injeta emotes do **BetterTTV (BTTV)**, **FrankerFaceZ (FFZ)** e **7TV** no chat da [Cinefy](https://cinefy.gg), além de integrar os emotes nativos da plataforma numa experiência unificada.

## Sobre

A Cinefy tem seu próprio sistema de emotes, mas a comunidade que vem da Twitch sente falta dos catálogos do BTTV, FFZ e 7TV. A Cinemotes resolve isso injetando os três catálogos diretamente no chat, com autocomplete próprio, menu de emotes e prioridades configuráveis.

O projeto foi construído do zero, sem framework, sem build step. É JavaScript puro rodando num service worker MV3 + content scripts.

## Funcionalidades

- **Emotes no chat**: reconhecimento automático de códigos do BTTV, FFZ, 7TV e Cinefy nas mensagens.
- **Autocomplete próprio**: digite `:` seguido de texto e um popup lista todos os emotes dos quatro providers, filtrando por prefixo ou substring. Navegação cíclica com `↑` / `↓` e confirmação com `Enter` ou `Tab`.
- **Menu de emotes**: botão integrado à barra de input do chat (no lugar do botão nativo). Painel com abas por provider, busca em tempo real e grade compacta.
- **Recentes**: os últimos emotes usados ficam salvos e disponíveis na aba "Recentes".
- **Tooltip**: preview do emote com nome, provider e escopo ao passar o mouse.
- **Prioridade correta**: emotes do canal vencem globais; dentro do mesmo escopo, a ordem é BTTV > FFZ > 7TV > Cinefy.
- **Cache agressivo**: resultados de API ficam em `storage.local` e `storage.session`, sobrevivendo à morte do service worker MV3.

## Instalação (modo desenvolvedor)

1. Baixe ou clone este repositório.
2. Abra `chrome://extensions` no Chrome (ou Brave, Edge, Opera).
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta do projeto.
5. Abra o chat de qualquer canal em [cinefy.gg](https://cinefy.gg).

## Como funciona

A extensão é dividida em três camadas:

**Service worker (background.js)**  
Faz as chamadas às APIs do BTTV, FFZ e 7TV. Resolve `username → channelId` da Twitch via decapi.me com backup em api.ivr.fi. Mantém os resultados em cache (memória + `chrome.storage.local` + `chrome.storage.session`).

**Main world (main-world.js)**  
Roda no contexto da própria página do Cinefy para interceptar `fetch` e `XMLHttpRequest`. Não modifica nada — apenas observa as respostas que o React do Cinefy já busca, e retransmite via `postMessage`. É assim que a extensão descobre os emotes nativos da plataforma sem precisar de token de autenticação.

**Content scripts (content/*.js)**  
Onde o trabalho pesado acontece. Trie de códigos de emote, parser que substitui text nodes por `<img>`, fila de parse com deadline, autocomplete, menu, tooltip, observer do chat virtualizado.

## Estrutura do projeto
.
├── manifest.json
├── main-world.js # patch de fetch/XHR no MAIN world
├── background.js # service worker: APIs + caches
├── styles.css # estilos do tooltip, autocomplete e menu
├── src/
│ ├── icon16.png
│ ├── icon48.png
│ └── icon128.png
└── content/
├── 00-core.js # constantes e utilitários
├── 01-state.js # maps, trie, versão
├── 02-tooltip.js # tooltip de hover
├── 03-emotes-map.js # merge por prioridade
├── 04-parser.js # substitui texto por emotes
├── 05-bridge.js # port com o service worker
├── 06-cinefy.js # bridge do Cinefy (main → content)
├── 07-autocomplete.js # popup de autocomplete
├── 08-menu.js # botão + painel de emotes
├── 09-recents.js # persistência de recentes
├── 10-chat-observer.js # observa o chat virtualizado
└── 11-init.js # bootstrap e troca de canal

text

A ordem dos content scripts no `manifest.json` importa — cada arquivo depende dos anteriores.

## Limitações conhecidas

- **Efeitos do BTTV** (`c!`, `w!`, `v!`, overlays `RainTime` e `cvHazmat`) não estão implementados. Por enquanto são tratados como texto puro. Planejados para uma versão futura.
- **Tooltip em emotes nativos do Cinefy**: o handler existe, mas o comportamento é inconsistente em alguns canais. Não é bloqueante e não afeta o uso diário.
- **Favoritos**: planejado, ainda não implementado.
- **Histórico de mensagens com `↑`**: planejado, ainda não implementado.

## Roadmap

- [ ] Implementar efeitos do BTTV (`c!`, `w!`, `v!`, overlays).
- [ ] Tooltip consistente em emotes nativos.
- [ ] Favoritos persistidos.
- [ ] Navegação por mensagens enviadas com `↑`.
- [ ] Página de opções (desabilitar providers, ajustar altura de emote, etc).

## Privacidade

A extensão **não coleta dados de usuário**. Não há analytics, não há telemetria, não há servidor próprio. Todas as chamadas de rede vão direto para as APIs públicas dos providers (BTTV, FFZ, 7TV, decapi.me, api.ivr.fi, api.cinefy.gg). O único dado armazenado localmente é a lista de emotes recentes, em `chrome.storage.local`.

## Contribuições

Pull requests são bem-vindos. Antes de abrir um PR grande, abra uma issue para alinhar a abordagem — a extensão depende de detalhes do DOM da Cinefy, e mudanças que parecem inofensivas podem quebrar em canais específicos.

## Licença

MIT.