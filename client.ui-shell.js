/* Package-local rc.5 client chunk. No host/profile dependency or native window hooks. */
window.__ModuleLoader__.load({
  id: '@local/dsh-soul-memory/client.ui-shell.js',
  factory() {
    'use strict';
    const css = `
/* Only body theme roots: DSH owns data-ds-*-theme and follows its own system setting. */
body[data-ds-dark-theme] {
  --dsw-alias-bg-base: #14171c;
  --dsw-alias-bg-layer-1: #1b2027;
  --dsw-alias-bg-layer-2: #232a33;
  --dsw-alias-bg-layer-3: #2d3642;
  --dsw-specific-sidebar-fill: #191d23;
  --dsw-specific-input-major: #20262e;
  --dsw-alias-label-primary: #edf2f7;
  --dsw-alias-label-secondary: #b8c3d0;
  --dsw-alias-label-tertiary: #96a4b5;
  --dsw-alias-label-caption: #96a4b5;
  --dsw-alias-border-l1: #ffffff12;
  --dsw-alias-border-l2: #ffffff20;
  --dsw-alias-border-l3: #ffffff2a;
  --dsw-alias-border-l4: #ffffff38;
  --dsw-alias-interactive-bg-hover: #b8d9f212;
  --dsw-alias-interactive-bg-active: #b8d9f220;
  --dsw-alias-interactive-bg-hover-solid: #2d3642;
  --dsw-specific-sidebar-nav-item-hover: #242d38;
  --dsw-specific-sidebar-nav-item-active: #2a3a4b;
  --dsw-specific-sidebar-nav-item-active-accent: #293440;
  --dsw-alias-button-elevated-fill: #2d3744;
  --dsw-alias-button-floating-fill: #252e39;
  --dsw-alias-button-floating-hover: #344253;
  --sm-shell-accent: #a6d9fb;
  --sm-shell-accent-hover: #c4e7ff;
  --sm-shell-on-accent: #102332;
  --sm-shell-accent-soft: #a6d9fb16;
  --sm-shell-focus: #a6d9fb;
  --sm-shell-card-shadow: 0 5px 18px #00000020;
  --dsw-focus-ring-color: var(--sm-shell-focus);
}
body:not([data-ds-dark-theme]) {
  --dsw-alias-bg-base: #f8fafc;
  --dsw-alias-bg-layer-1: #ffffff;
  --dsw-alias-bg-layer-2: #edf2f7;
  --dsw-alias-bg-layer-3: #e4ebf2;
  --dsw-specific-sidebar-fill: #edf2f6;
  --dsw-specific-input-major: #ffffff;
  --dsw-alias-label-primary: #172332;
  --dsw-alias-label-secondary: #42556b;
  --dsw-alias-label-tertiary: #586b80;
  --dsw-alias-label-caption: #586b80;
  --dsw-alias-border-l1: #18334f14;
  --dsw-alias-border-l2: #18334f26;
  --dsw-alias-border-l3: #18334f38;
  --dsw-alias-border-l4: #18334f50;
  --dsw-alias-interactive-bg-hover: #2475ad0d;
  --dsw-alias-interactive-bg-active: #2475ad1c;
  --dsw-alias-interactive-bg-hover-solid: #e4ebf2;
  --dsw-specific-sidebar-nav-item-hover: #e1ebf3;
  --dsw-specific-sidebar-nav-item-active: #d5e7f5;
  --dsw-specific-sidebar-nav-item-active-accent: #dfeaf4;
  --dsw-alias-button-elevated-fill: #e0eaf3;
  --dsw-alias-button-floating-fill: #f0f5fa;
  --dsw-alias-button-floating-hover: #d5e4ef;
  --sm-shell-accent: #205e88;
  --sm-shell-accent-hover: #174b70;
  --sm-shell-on-accent: #ffffff;
  --sm-shell-accent-soft: #205e880c;
  --sm-shell-focus: #205e88;
  --sm-shell-card-shadow: 0 5px 18px #18334f0a;
  --dsw-focus-ring-color: var(--sm-shell-focus);
}
/* Exact rc.5 chrome classes deliberately fail closed on future class changes.
   Do not recolor generic buttons, switches, permission controls, danger or Stop. */
body :is(
  .wtg9ga_panelRow, .wtg9ga_newSession, .wtg9ga_iconButton,
  .GAkraW_iconButton, .GAkraW_searchButton, .an3WzG_tab,
  .GRgSLq_add, .GRgSLq_primary[aria-label="Send message"]
) {
  transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
}
body .wtg9ga_panelRow:is(.wtg9ga_panelActive, [aria-expanded="true"]) {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--sm-shell-accent);
  box-shadow: inset 2px 0 0 var(--sm-shell-accent);
}
body :is(.wtg9ga_panelRow, .wtg9ga_iconButton, .GAkraW_iconButton, .GAkraW_searchButton, .an3WzG_tab):hover:not(:disabled):not([aria-disabled="true"]) {
  background-color: var(--dsw-specific-sidebar-nav-item-hover);
}
body :is(.wtg9ga_newSession, .GRgSLq_primary[aria-label="Send message"]):not(:disabled):not([aria-disabled="true"]) {
  background-color: var(--sm-shell-accent);
  color: var(--sm-shell-on-accent);
}
body :is(.wtg9ga_newSession, .GRgSLq_primary[aria-label="Send message"]):hover:not(:disabled):not([aria-disabled="true"]) {
  background-color: var(--sm-shell-accent-hover);
}
body .an3WzG_tab[aria-selected="true"] {
  color: var(--sm-shell-accent);
}
body .GRgSLq_card {
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l2);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2), var(--sm-shell-card-shadow);
}
body .GRgSLq_card:focus-within {
  box-shadow: inset 0 0 0 1px var(--sm-shell-focus), var(--sm-shell-card-shadow);
}
body .GRgSLq_input {
  caret-color: var(--sm-shell-accent);
}
body .GAkraW_search:focus-within {
  box-shadow: inset 0 0 0 1px var(--sm-shell-focus);
}
body :is(
  .wtg9ga_panelRow, .wtg9ga_newSession, .wtg9ga_iconButton,
  .GAkraW_iconButton, .GAkraW_searchButton, .GAkraW_searchInput,
  .an3WzG_tab, .GRgSLq_add, .GRgSLq_primary[aria-label="Send message"]
):focus-visible {
  outline: 2px solid var(--sm-shell-focus);
  outline-offset: -2px;
}
body :is(
  .wtg9ga_panelRow, .wtg9ga_newSession, .wtg9ga_iconButton,
  .GAkraW_iconButton, .GAkraW_searchButton, .an3WzG_tab,
  .GRgSLq_add, .GRgSLq_primary[aria-label="Send message"]
):is(:disabled, [aria-disabled="true"]) {
  opacity: .45;
  cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  body :is(
    .wtg9ga_panelRow, .wtg9ga_newSession, .wtg9ga_iconButton,
    .GAkraW_iconButton, .GAkraW_searchButton, .an3WzG_tab,
    .GRgSLq_add, .GRgSLq_primary[aria-label="Send message"]
  ) { transition: none; }
}
@media (forced-colors: active) {
  body .GRgSLq_card { outline: 1px solid CanvasText; }
  body .GRgSLq_card:focus-within { outline: 2px solid Highlight; }
}
`;
    function mount(document) {
      const style = document.createElement('style');
      style.setAttribute('data-plugin', '@local/dsh-soul-memory');
      style.setAttribute('data-plugin-css', 'soul-memory-ui-shell');
      style.textContent = css;
      document.head.appendChild(style);
      return () => style.remove();
    }
    return { css, mount };
  },
});
