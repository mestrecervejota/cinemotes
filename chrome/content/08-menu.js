'use strict';

// ─── Menu de emotes ───────────────────────────────────────────────────────────
//
// Botão injetado ao lado do "Chat" que abre um painel com tabs. Reusa a
// função acInsertIntoInput do autocomplete para inserir no chat.

const MENU_PANEL_ID       = 'cinemotes-menu';
const MENU_BTN_ATTR       = 'data-cinemotes-menu-btn';
const MENU_PANEL_CLS      = 'cinemotes-menu-panel';
const MENU_TAB_CLS        = 'cinemotes-menu-tab';
const MENU_TAB_ACTIVE_CLS = 'cinemotes-menu-tab-active';
const MENU_ITEM_CLS       = 'cinemotes-menu-item';
const MENU_GRID_CLS       = 'cinemotes-menu-grid';
const MENU_EMPTY_CLS      = 'cinemotes-menu-empty';
const MENU_SEARCH_CLS     = 'cinemotes-menu-search';
const MENU_TABS_BAR_CLS   = 'cinemotes-menu-tabs-bar';
const MENU_HEADER_CLS     = 'cinemotes-menu-header';

const MENU_WIDTH          = 420;
const MENU_HEIGHT         = 460;
const MENU_CHANNEL_LIMIT  = 30;   // primeiros N no tab Canal
const MENU_GLOBAL_LIMIT   = 60;   // primeiros N por provider
const MENU_BROWSE_LIMIT   = 200;  // limite no tab Todos quando há busca

const MENU_DEFAULT_TAB = 'cinefy';

const ICON_RECENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="1em" height="1em" aria-hidden="true"><path fill="currentColor" d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88 88.1 88.1 0 0 1-88 88m56-88a8 8 0 0 1-8 8h-48a8 8 0 0 1-8-8V64a8 8 0 0 1 16 0v64h40a8 8 0 0 1 8 8"/></svg>`;

const ICON_CINEFY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1235 850" width="1em" height="1em" aria-hidden="true"><path d="M 1200 455 L 1194 424 L 1176 382 L 1154 353 L 1124 329 L 1095 316 L 1053 311 L 1014 319 L 982 336 L 977 333 L 999 274 L 1003 225 L 995 179 L 972 129 L 954 105 L 933 84 L 894 57 L 841 37 L 785 32 L 750 37 L 720 47 L 696 59 L 665 81 L 638 107 L 617 134 L 599 166 L 592 190 L 586 196 L 580 190 L 580 155 L 567 107 L 552 83 L 533 65 L 505 50 L 472 43 L 434 45 L 391 61 L 356 89 L 334 125 L 328 159 L 331 176 L 341 201 L 336 204 L 319 200 L 283 198 L 250 202 L 213 214 L 178 237 L 160 261 L 159 273 L 167 279 L 206 288 L 210 294 L 205 298 L 172 298 L 139 306 L 117 316 L 89 336 L 68 359 L 46 399 L 36 434 L 34 465 L 41 504 L 50 528 L 70 562 L 86 581 L 119 608 L 155 626 L 197 636 L 241 637 L 250 665 L 271 699 L 297 724 L 331 746 L 373 763 L 425 773 L 480 773 L 527 765 L 567 787 L 604 801 L 640 809 L 679 812 L 734 805 L 791 785 L 844 754 L 896 711 L 962 712 L 1014 704 L 1065 687 L 1106 664 L 1129 646 L 1151 623 L 1180 576 L 1198 518 L 1201 491 Z M 444 345 L 452 330 L 463 319 L 475 312 L 500 308 L 521 313 L 809 441 L 825 458 L 828 468 L 827 484 L 821 495 L 811 505 L 656 571 L 516 635 L 500 639 L 480 639 L 469 636 L 458 629 L 451 621 L 444 602 L 442 354 Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/></svg>`;

const ICON_BTTV = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-25 -25 350 350" width="1em" height="1em" aria-hidden="true"><path fill="currentColor" d="M150 1.74C68.409 1.74 1.74 68.41 1.74 150S68.41 298.26 150 298.26h148.26V150.17h-.004c0-.057.004-.113.004-.17C298.26 68.409 231.59 1.74 150 1.74zm0 49c55.11 0 99.26 44.15 99.26 99.26 0 55.11-44.15 99.26-99.26 99.26-55.11 0-99.26-44.15-99.26-99.26 0-55.11 44.15-99.26 99.26-99.26z"/><path fill="currentColor" d="M161.388 70.076c-10.662 0-19.42 7.866-19.42 17.67 0 9.803 8.758 17.67 19.42 17.67 10.662 0 19.42-7.867 19.42-17.67 0-9.804-8.758-17.67-19.42-17.67zm45.346 24.554-.02.022-.004.002c-5.402 2.771-11.53 6.895-18.224 11.978l-.002.002-.004.002c-25.943 19.766-60.027 54.218-80.344 80.33h-.072l-1.352 1.768c-5.114 6.69-9.267 12.762-12.098 18.006l-.082.082.022.021v.002l.004.002.174.176.052-.053.102.053-.07.072c30.826 30.537 81.213 30.431 111.918-.273 30.783-30.784 30.8-81.352.04-112.152l-.005-.004zM87.837 142.216c-9.803 0-17.67 8.758-17.67 19.42 0 10.662 7.867 19.42 17.67 19.42 9.804 0 17.67-8.758 17.67-19.42 0-10.662-7.866-19.42-17.67-19.42z"/></svg>`;

const ICON_FFZ = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="1em" height="1em" aria-hidden="true"><path fill="currentColor" d="M40.0716 67.9018C33.7085 68.5686 28.834 65.7635 24.3565 61.822C23.9566 61.4691 23.1627 61.4811 22.5614 61.514C22.1644 61.5349 21.7996 61.9266 21.3968 62.1001C19.6805 62.8388 18.8194 62.5038 17.5526 61.2209C16.2917 59.9439 14.8177 58.8853 13.4283 57.7399C10.4423 55.2816 7.3629 52.946 5.381 49.4381C4.42069 47.7395 3.76103 46.0379 4.08211 44.0671C4.50826 41.4354 4.49075 38.5854 5.54445 36.2408C6.84043 33.355 8.86903 30.7442 10.8947 28.289C13.1101 25.6035 15.5503 26.1537 17.2432 29.2101C18.8078 32.0361 18.9012 34.916 18.2357 37.9843C17.9321 39.3779 17.8474 40.8463 17.8679 42.2788C17.8737 42.7722 18.4225 43.5497 18.8603 43.6664C19.2923 43.78 20.1592 43.3673 20.3781 42.9397C22.074 39.6501 23.8866 36.3934 25.1855 32.9363C25.9064 31.0164 25.74 28.7376 25.921 26.6143C26.0611 24.9844 25.9123 23.3037 26.2538 21.7277C27.1878 17.4094 30.0454 14.8554 34.0179 13.4648C34.9841 13.1269 35.9269 12.7142 36.9076 12.4361C40.1446 11.518 43.2882 12.0473 45.8977 14.045C48.3787 15.944 49.771 18.7641 50.7167 21.8533C51.4202 24.1441 52.4213 26.387 53.6239 28.4505C54.4821 29.9248 55.1008 31.3752 55.0921 33.041C55.0775 35.8012 55.7284 38.3611 57.0448 40.7386C57.2842 41.1723 57.8008 41.4474 58.189 41.7973C58.3992 41.2829 58.8195 40.7536 58.7844 40.2601C58.6152 37.8827 58.2532 35.5201 58.0927 33.1456C57.9234 30.6665 61.2626 26.5365 63.6122 25.9534C65.8335 25.4031 66.572 27.2812 67.6986 28.4236C71.5165 32.2963 73.2328 37.3773 74.9141 42.4044C75.6117 44.4918 75.9006 46.7825 75.997 48.9985C76.0758 50.8198 74.6076 52.01 73.332 53.0806C70.095 55.793 66.8084 58.4217 62.9964 60.2938C61.7062 60.9278 60.6496 62.0433 59.4091 62.8118C58.8282 63.1707 57.8854 63.5954 57.4243 63.3561C55.0541 62.115 53.2561 63.5714 51.4669 64.5972C47.8504 66.6756 44.1872 68.3982 40.0775 67.9018H40.0716Z"/></svg>`;

const ICON_7TV = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 23.551" width="1em" height="1em" aria-hidden="true"><path fill="currentColor" d="M2.383,0,0,4.127,1.473,6.676H11.7L3.426,21,4.9,23.551H9.66Q14.532,15.113,19.4,6.676L15.549,0ZM18.492,0l3.856,6.676h2.945l2.381-4.125L26.2,0Zm2.383,9.225L17.021,15.9l4.417,7.649H26.2L33,11.775l-1.473-2.55H26.764l-2.944,5.1Z"/></svg>`;

const ICON_ALL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="1em" height="1em" aria-hidden="true"><path fill="currentColor" d="M128 24a104 104 0 1 0 104 104A104.12 104.12 0 0 0 128 24m88 104a87.6 87.6 0 0 1-3.33 24h-38.51a157.4 157.4 0 0 0 0-48h38.51a87.6 87.6 0 0 1 3.33 24m-114 40h52a115.1 115.1 0 0 1-26 45a115.3 115.3 0 0 1-26-45m-3.9-16a140.8 140.8 0 0 1 0-48h59.88a140.8 140.8 0 0 1 0 48ZM40 128a87.6 87.6 0 0 1 3.33-24h38.51a157.4 157.4 0 0 0 0 48H43.33A87.6 87.6 0 0 1 40 128m114-40h-52a115.1 115.1 0 0 1 26-45a115.3 115.3 0 0 1 26 45m52.33 0h-35.62a135.3 135.3 0 0 0-22.3-45.6A88.29 88.29 0 0 1 206.37 88Zm-98.74-45.6A135.3 135.3 0 0 0 85.29 88H49.63a88.29 88.29 0 0 1 57.96-45.6M49.63 168h35.66a135.3 135.3 0 0 0 22.3 45.6A88.29 88.29 0 0 1 49.63 168m98.78 45.6a135.3 135.3 0 0 0 22.3-45.6h35.66a88.29 88.29 0 0 1-57.96 45.6"/></svg>`;

const ICON_SEARCH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="1em" height="1em" aria-hidden="true"><path fill="currentColor" d="m229.66 218.34l-50.07-50.06a88.11 88.11 0 1 0-11.31 11.31l50.06 50.07a8 8 0 0 0 11.32-11.32M40 112a72 72 0 1 1 72 72a72.08 72.08 0 0 1-72-72"/></svg>`;

const MENU_TABS = [
  { id: 'recent', label: 'Recentes', icon: ICON_RECENT },
  { id: 'cinefy', label: 'Cinefy',   icon: ICON_CINEFY },
  { id: 'bttv',   label: 'BTTV',     icon: ICON_BTTV },
  { id: 'ffz',    label: 'FFZ',      icon: ICON_FFZ },
  { id: '7tv',    label: '7TV',      icon: ICON_7TV },
  { id: 'all',    label: 'Todos',    icon: ICON_ALL }
];

// ─── Estado ───────────────────────────────────────────────────────────────────

let menuPanel        = null;
let menuOpen         = false;
let menuActiveTab    = MENU_DEFAULT_TAB;
let menuSearchQuery  = '';
let menuSearchTimer  = 0;
let menuButton       = null;
let menuInjectionObs = null;
let menuRecentCache  = [];      // Fase 6 vai popular
let menuFavCache     = new Set(); // Fase 6 vai popular

// ─── Estilos do botão (herdados do Cinefy) ────────────────────────────────────

// Encontra o botão nativo de emotes do Cinefy — o que vamos substituir.
// Fallback: se não achar, usa o botão "Chat" para ainda ter onde ancorar.
function menuFindAnchorButton() {
  const native = document.querySelector('button[aria-label="Emotes"][aria-haspopup="dialog"]');
  if (native) return native;
  // Fallbacks para outras versões de UI do Cinefy
  const alt = document.querySelector('button[aria-label="Emotes"]')
           || document.querySelector('button[aria-label*="Emote" i]');
  if (alt) return alt;
  // Último recurso: botão de envio
  const btns = document.querySelectorAll('button');
  for (const b of btns) {
    if (b.textContent?.trim() === 'Chat') return b;
  }
  return null;
}

function menuFindSettingsButton() {
  return document.querySelector('button[aria-label="Configurações do chat"]')
      || document.querySelector('button[aria-label*="Configura"]')
      || document.querySelector('button[aria-label*="Settings"]');
}

function menuBuildButton() {
  const native = document.querySelector('button[aria-label="Emotes"][aria-haspopup="dialog"]')
              || document.querySelector('button[aria-label="Emotes"]');
  const settings = menuFindSettingsButton();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute(MENU_BTN_ATTR, '1');
  btn.setAttribute('aria-label', 'Emotes');
  btn.setAttribute('aria-haspopup', 'dialog');

  // Herda as classes do botão nativo (mais fiel ao layout do Cinefy).
  // Se o nativo não estiver disponível, cai pro botão de configurações.
  const styleSource = native || settings;
  if (styleSource?.className) {
    btn.className = styleSource.className;
  }

  // Envolve o ícone no mesmo wrapper inline do nativo, se possível
  const wrap = document.createElement('div');
  const wrapSource = native?.firstElementChild || settings?.firstElementChild;
  if (wrapSource?.className) {
    wrap.className = wrapSource.className;
  }
  wrap.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1.25em" height="1.25em" viewBox="0 0 1024 1024">
      <title>Cinemotes</title>
      <path d="M 626 553 L 354 596 L 369 616 L 380 627 L 403 644 L 418 652 L 440 660 L 459 664 L 466 664 L 467 665 L 503 664 L 525 659 L 541 653 L 560 643 L 578 630 L 595 613 L 610 592 L 620 572 Z M 321 432 L 305 438 L 299 442 L 292 449 L 288 455 L 282 471 L 282 488 L 288 504 L 292 510 L 299 517 L 305 521 L 321 527 L 338 527 L 354 521 L 360 517 L 367 510 L 371 504 L 377 488 L 377 471 L 371 455 L 367 449 L 360 442 L 354 438 L 338 432 Z M 531 272 L 515 278 L 509 282 L 502 289 L 498 295 L 492 311 L 492 328 L 498 344 L 502 350 L 509 357 L 515 361 L 531 367 L 548 367 L 564 361 L 570 357 L 577 350 L 581 344 L 587 328 L 587 311 L 581 295 L 577 289 L 570 282 L 564 278 L 548 272 Z M 452 211 L 484 212 L 485 213 L 507 215 L 530 220 L 558 229 L 577 237 L 608 254 L 632 271 L 645 282 L 667 304 L 687 329 L 701 351 L 712 372 L 720 391 L 730 423 L 730 427 L 734 442 L 735 455 L 736 456 L 737 481 L 738 482 L 737 514 L 736 515 L 734 537 L 729 560 L 720 588 L 712 607 L 695 638 L 678 662 L 667 675 L 645 697 L 620 717 L 598 731 L 577 742 L 558 750 L 526 760 L 522 760 L 507 764 L 494 765 L 493 766 L 468 767 L 467 768 L 435 767 L 434 766 L 412 764 L 389 759 L 361 750 L 342 742 L 311 725 L 287 708 L 274 697 L 252 675 L 232 650 L 218 628 L 207 607 L 199 588 L 189 556 L 189 552 L 185 537 L 184 524 L 183 523 L 182 498 L 181 497 L 182 465 L 183 464 L 185 442 L 190 419 L 199 391 L 207 372 L 224 341 L 241 317 L 252 304 L 274 282 L 299 262 L 321 248 L 342 237 L 361 229 L 393 219 L 397 219 L 412 215 L 425 214 L 426 213 L 451 212 Z M 234 142 L 191 184 L 167 212 L 136 255 L 111 297 L 90 340 L 70 392 L 56 442 L 55 451 L 52 461 L 49 484 L 48 485 L 46 512 L 45 513 L 45 526 L 44 527 L 44 572 L 45 573 L 45 585 L 46 586 L 48 612 L 58 660 L 69 695 L 80 722 L 91 745 L 110 778 L 125 800 L 143 823 L 173 855 L 201 880 L 229 901 L 263 922 L 306 943 L 345 957 L 384 967 L 394 968 L 400 970 L 406 970 L 407 971 L 421 972 L 422 973 L 445 974 L 446 975 L 505 974 L 506 973 L 524 972 L 525 971 L 555 967 L 598 956 L 639 941 L 675 924 L 719 898 L 742 881 L 748 881 L 757 884 L 770 886 L 779 889 L 792 891 L 801 894 L 805 894 L 814 897 L 827 899 L 876 911 L 884 911 L 888 909 L 893 904 L 895 899 L 895 892 L 893 887 L 773 768 L 777 762 L 791 748 L 806 730 L 827 701 L 840 680 L 859 643 L 873 608 L 886 562 L 890 536 L 891 535 L 893 509 L 894 508 L 894 496 L 895 495 L 895 452 L 894 451 L 894 438 L 893 437 L 891 411 L 881 363 L 870 328 L 858 299 L 835 255 L 813 222 L 794 198 L 768 170 L 738 143 L 710 122 L 676 101 L 635 81 L 597 67 L 554 56 L 533 53 L 532 52 L 517 51 L 516 50 L 492 49 L 491 48 L 441 49 L 440 50 L 431 50 L 430 51 L 423 51 L 411 54 L 406 54 L 375 62 L 342 74 L 302 94 L 266 117 Z" fill="#f3f3f3" fill-rule="evenodd" clip-rule="evenodd"/>
    </svg>`;
  btn.appendChild(wrap);

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    menuToggle();
  });

  btn.style.marginRight = '4px';
  return btn;
}

function menuInjectButton() {
  const anchor = menuFindAnchorButton();
  if (!anchor) return false;
  const parent = anchor.parentElement;
  if (!parent) return false;

  // Remove qualquer botão nosso que esteja fora do parent correto.
  const allExisting = document.querySelectorAll(`[${MENU_BTN_ATTR}]`);
  for (const el of allExisting) {
    if (el.parentElement !== parent) el.remove();
  }

  // Se já existe um no lugar certo, nada a fazer.
  if (parent.querySelector(`[${MENU_BTN_ATTR}]`)) return true;

  const btn = menuBuildButton();
  // Insere o nosso ANTES do nativo. O nativo está com display:none via CSS,
  // então visualmente o nosso ocupa a posição dele.
  parent.insertBefore(btn, anchor);
  menuButton = btn;
  return true;
}

let menuInjectDebounce = 0;
function menuInstallInjectionObserver() {
  if (menuInjectionObs) return;
  menuInjectionObs = new MutationObserver(() => {
    clearTimeout(menuInjectDebounce);
    menuInjectDebounce = setTimeout(menuInjectButton, 200);
  });
  menuInjectionObs.observe(document.body, { childList: true, subtree: true });
  menuInjectButton();
}

// ─── Painel ───────────────────────────────────────────────────────────────────

function menuEnsurePanel() {
  if (menuPanel) return;
  menuPanel = document.createElement('div');
  menuPanel.id = MENU_PANEL_ID;
  menuPanel.className = MENU_PANEL_CLS;
  menuPanel.setAttribute('role', 'dialog');
  menuPanel.setAttribute('aria-label', 'Menu de emotes');

    menuPanel.innerHTML = `
    <div class="${MENU_HEADER_CLS}">
      <div class="cinemotes-menu-search-wrap">
        <span class="cinemotes-menu-search-icon">${ICON_SEARCH}</span>
        <input type="text" class="${MENU_SEARCH_CLS}" placeholder="Buscar emote..." aria-label="Buscar emote">
      </div>
    </div>
    <div class="${MENU_TABS_BAR_CLS}" role="tablist"></div>
    <div class="${MENU_GRID_CLS}" role="tabpanel"></div>
  `;

  // Tabs
  const tabsBar = menuPanel.querySelector(`.${MENU_TABS_BAR_CLS}`);
  for (const tab of MENU_TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = MENU_TAB_CLS;
    btn.dataset.tab = tab.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-label', tab.label);
    btn.setAttribute('title', tab.label);
    btn.innerHTML = tab.icon;
    btn.addEventListener('click', () => menuSwitchTab(tab.id));
    tabsBar.appendChild(btn);
  }

  // Busca
  const search = menuPanel.querySelector(`.${MENU_SEARCH_CLS}`);
  search.addEventListener('input', () => {
    clearTimeout(menuSearchTimer);
    menuSearchTimer = setTimeout(() => {
      menuSearchQuery = search.value.trim();
      menuRenderResults();
    }, 80);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (search.value) {
        search.value = '';
        menuSearchQuery = '';
        menuRenderResults();
      } else {
        menuClose();
      }
    }
  });

  // Delegação de clique na grid
  const grid = menuPanel.querySelector(`.${MENU_GRID_CLS}`);
  grid.addEventListener('mousedown', (e) => {
    const item = e.target.closest(`.${MENU_ITEM_CLS}`);
    if (!item) return;
    e.preventDefault();
    const code = item.dataset.code;
    if (!code) return;
    const emote = emotes.get(code);
    if (!emote) return;
    menuInsertEmote(emote);
  });

  document.body.appendChild(menuPanel);
}

function menuPosition() {
  if (!menuPanel || !menuButton) return;
  const rect = menuButton.getBoundingClientRect();

  // Alinha a borda direita do painel com a borda direita do botão.
  let left = rect.right - MENU_WIDTH;
  if (left < 8) left = 8;
  if (left + MENU_WIDTH > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - MENU_WIDTH - 8);
  }

  // Abre acima do botão (a barra de input fica no rodapé).
  let top = rect.top - MENU_HEIGHT - 8;
  if (top < 8) top = 8;

  menuPanel.style.left   = `${left}px`;
  menuPanel.style.top    = `${top}px`;
  menuPanel.style.width  = `${MENU_WIDTH}px`;
  menuPanel.style.height = `${MENU_HEIGHT}px`;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function menuSwitchTab(id) {
  menuActiveTab = id;
  menuSearchQuery = '';
  const search = menuPanel?.querySelector(`.${MENU_SEARCH_CLS}`);
  if (search) search.value = '';
  menuRenderTabs();
  menuRenderResults();
}

function menuRenderTabs() {
  if (!menuPanel) return;
  const tabs = menuPanel.querySelectorAll(`.${MENU_TAB_CLS}`);
  for (const t of tabs) {
    if (t.dataset.tab === menuActiveTab) t.classList.add(MENU_TAB_ACTIVE_CLS);
    else t.classList.remove(MENU_TAB_ACTIVE_CLS);
  }
}

// ─── Coleta de itens por tab ──────────────────────────────────────────────────

function menuCollectCinefy() {
  const out = [];
  for (const [code, data] of emotes) {
    if (data.provider !== 'Cinefy') continue;
    out.push({ code, data });
  }
  // Canal primeiro, depois globais; dentro de cada, alfabético.
  out.sort((a, b) => {
    const sa = a.data.scope === 'Canal' ? 0 : 1;
    const sb = b.data.scope === 'Canal' ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.code.localeCompare(b.code);
  });
  return out.slice(0, MENU_BROWSE_LIMIT);
}

function menuCollectGlobalByProvider(provider) {
  const out = [];
  for (const [code, data] of emotes) {
    if (data.scope === 'Canal') continue;
    if (data.provider !== provider) continue;
    out.push({ code, data });
  }
  out.sort((a, b) => a.code.localeCompare(b.code));
  return out.slice(0, MENU_GLOBAL_LIMIT);
}

function menuCollectAll(query) {
  const out = [];
  const q = query.toLowerCase();
  for (const [code, data] of emotes) {
    if (!code.toLowerCase().includes(q)) continue;
    out.push({ code, data });
  }
  out.sort((a, b) => {
    const pa = emotePriority(a.data.provider, a.data.scope);
    const pb = emotePriority(b.data.provider, b.data.scope);
    if (pa !== pb) return pb - pa;
    return a.code.localeCompare(b.code);
  });
  return out.slice(0, MENU_BROWSE_LIMIT);
}

function menuCollectRecent() {
  return menuRecentCache
    .map(code => {
      const data = emotes.get(code);
      return data ? { code, data } : null;
    })
    .filter(Boolean);
}

function menuCollectFav() {
  const out = [];
  for (const code of menuFavCache) {
    const data = emotes.get(code);
    if (data) out.push({ code, data });
  }
  out.sort((a, b) => a.code.localeCompare(b.code));
  return out;
}

function menuCollectForActiveTab() {
  const q = menuSearchQuery;

  // Busca global: sobrescreve o comportamento de qualquer tab
  if (q) return menuCollectAll(q);

  switch (menuActiveTab) {
    case 'recent':  return menuCollectRecent();
    case 'cinefy':  return menuCollectCinefy();
    case 'bttv':    return menuCollectGlobalByProvider('BTTV');
    case 'ffz':     return menuCollectGlobalByProvider('FFZ');
    case '7tv':     return menuCollectGlobalByProvider('7TV');
    case 'all':     return menuCollectAll(''); // sem query → lista geral limitada
    default:        return [];
  }
}

// ─── Render da grid ───────────────────────────────────────────────────────────

function menuBuildSrcset(url, provider) {
  if (!url) return '';
  try {
    if (provider === 'BTTV' || provider === '7TV') {
      // https://cdn.{betterttv.net|7tv.app}/emote/<id>/1x.<ext>
      const m = url.match(/^(.*\/emote\/[^/]+)\/1x(\.\w+)?$/);
      if (m) {
        const base = m[1];
        const ext  = m[2] || '';
        return `${base}/1x${ext} 1x, ${base}/2x${ext} 2x, ${base}/3x${ext} 4x`;
      }
    }
    if (provider === 'FFZ') {
      // https://cdn.frankerfacez.com/emote/<id>/<n>
      const m = url.match(/^(.*\/emote\/[^/]+)\/(\d+)$/);
      if (m) {
        return `${m[1]}/1 1x, ${m[1]}/2 2x, ${m[1]}/4 4x`;
      }
    }
    if (provider === 'Cinefy') {
      // https://cdn.cinefy.gg/emotes/<id>/original?width=<n>
      if (url.includes('?width=')) {
        const base = url.replace(/\?width=\d+$/, '');
        return `${base}?width=60 1x, ${base}?width=120 2x, ${base}?width=180 4x`;
      }
    }
  } catch {}
  return '';
}

function menuRenderResults() {
  if (!menuPanel) return;
  const grid = menuPanel.querySelector(`.${MENU_GRID_CLS}`);
  if (!grid) return;

  const items = menuCollectForActiveTab();

  if (!items.length) {
    const msg = menuActiveTab === 'recent'
      ? 'Nada por aqui ainda. Use alguns emotes para eles aparecerem.'
      : menuSearchQuery
        ? 'Nenhum emote encontrado.'
        : 'Nenhum emote disponível.';
    grid.innerHTML = `<div class="${MENU_EMPTY_CLS}">${msg}</div>`;
    return;
  }

  let html = '';
  for (const { code, data } of items) {
    const scopeLabel = data.scope === 'Canal' ? 'canal' : 'global';
    const srcset = menuBuildSrcset(data.url, data.provider);
    const srcsetAttr = srcset ? ` srcset="${srcset}"` : '';
    html +=
      `<button type="button" class="${MENU_ITEM_CLS}" data-code="${code}"` +
      ` data-provider="${data.provider}" title="${code} (${data.provider} · ${scopeLabel})">` +
        `<div class="cinemotes-menu-thumb">` +
          `<img loading="lazy" decoding="async" src="${data.url}"${srcsetAttr} alt="">` +
        `</div>` +
      `</button>`;
  }
  grid.innerHTML = html;
}

// ─── Inserção (reusa o autocomplete) ──────────────────────────────────────────

function menuInsertEmote(emote) {
  const input = acFindChatInput();
  if (!input) { menuClose(); return; }

  // Insere no cursor atual ou no fim do input
  let pos;
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
    pos = input.selectionEnd ?? input.value.length;
  } else {
    // contenteditable: insere no fim
    pos = null;
  }

  let ok = false;
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
    const before = input.value.slice(0, pos);
    const after  = input.value.slice(pos);
    const spacer = before.length && !/\s$/.test(before) ? ' ' : '';
    const newText = before + spacer + emote.code + ' ' + after;

    const proto = input.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, newText);
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const cursor = (before + spacer + emote.code + ' ').length;
    input.setSelectionRange(cursor, cursor);
    ok = true;
  } else if (input.isContentEditable) {
    // Simples: appenda no fim
    const spacer = input.textContent && !/\s$/.test(input.textContent) ? ' ' : '';
    input.textContent = input.textContent + spacer + emote.code + ' ';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    ok = true;
  }

  if (ok) {
    recentsPush(emote.code);
    input.focus();
    menuClose();
  }
}

// ─── Abrir/fechar ─────────────────────────────────────────────────────────────

function menuOpenPanel() {
  menuEnsurePanel();
  menuPosition();
  menuRenderTabs();
  menuRenderResults();
  menuPanel.style.display = 'flex';
  menuOpen = true;
  // Sem foco automático no input de busca — o usuário pode clicar nele
  // se quiser filtrar, mas assim garantimos que o foco do chat permaneça
  // onde estava e a inserção caia no lugar certo.
}

function menuClose() {
  if (!menuOpen && !menuPanel) return;
  menuOpen = false;
  if (menuPanel) menuPanel.style.display = 'none';
}

function menuToggle() {
  if (menuOpen) menuClose();
  else menuOpenPanel();
}

// ─── Eventos globais ──────────────────────────────────────────────────────────

document.addEventListener('pointerdown', (e) => {
  if (!menuOpen) return;
  if (menuPanel && menuPanel.contains(e.target)) return;
  if (menuButton && menuButton.contains(e.target)) return;
  menuClose();
}, true);

document.addEventListener('keydown', (e) => {
  if (!menuOpen) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    menuClose();
  }
}, true);

window.addEventListener('resize', () => {
  if (menuOpen) menuPosition();
}, { passive: true });

window.addEventListener('scroll', () => {
  if (menuOpen) menuPosition();
}, { capture: true, passive: true });

// ─── Bootstrap ────────────────────────────────────────────────────────────────

menuInstallInjectionObserver();