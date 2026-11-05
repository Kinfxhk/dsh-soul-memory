window.__ModuleLoader__.load({
  id: '@local/dsh-soul-memory',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;

    /* The editor is a short-lived overlay; its launchers live in the left
     * sidebar and native settings, never over the conversation. */

    const TARGETS = [
      {
        id: 'soul',
        label: 'Soul',
        file: 'SOUL.md',
        hint: 'Identity, voice, and style. You own this file; it is the first prompt section.',
      },
      {
        id: 'user',
        label: 'User',
        file: 'USER.md',
        hint: 'Stable facts and preferences about you. Injected as user-profile context.',
      },
      {
        id: 'memory',
        label: 'Memory',
        file: 'MEMORY.md',
        hint: 'Environment, projects, and lessons. Injected as long-term memory context.',
      },
    ];

    const CSS = [
      '.sm-sidebar-action{display:grid;place-items:center;flex:none;width:32px;height:32px;padding:0;',
      'border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.sm-sidebar-action:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.sm-sidebar-action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.sm-sidebar-action svg{display:block;pointer-events:none;}',
      '.sm-backdrop{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:20px;',
      'pointer-events:auto;background:rgba(4,6,10,.42);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);}',
      '.sm-panel{width:min(820px,94vw);height:min(700px,86vh);display:flex;flex-direction:column;',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:16px;overflow:hidden;',
      'box-shadow:0 24px 80px rgba(0,0,0,.38);outline:none;}',

      '.sm-head{display:flex;align-items:center;gap:12px;padding:14px 16px 12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.sm-headtext{min-width:0;flex:1;}',
      '.sm-title{font-size:15px;font-weight:650;letter-spacing:.01em;}',
      '.sm-sub{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.sm-close{width:28px;height:28px;flex:none;border:0;border-radius:8px;background:transparent;',
      'color:var(--dsw-alias-label-secondary);font-size:18px;line-height:1;cursor:pointer;}',
      '.sm-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',

      '.sm-tabs{display:flex;gap:2px;padding:8px 12px 0;border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.sm-tab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);',
      'padding:7px 12px 9px;border-radius:9px 9px 0 0;cursor:pointer;font:inherit;font-size:12px;text-align:left;}',
      '.sm-tab span{display:block;margin-top:1px;font-size:10px;opacity:.7;}',
      '.sm-tab:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.sm-tab[aria-selected="true"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);',
      'box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary);}',

      '.sm-meta{padding:9px 18px 0;font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary);min-height:17px;}',
      '.sm-error{margin:8px 18px 0;padding:7px 9px;border-radius:8px;font-size:11px;line-height:1.4;',
      'border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2);}',
      '.sm-editor{flex:1;width:100%;min-height:0;resize:none;border:0;outline:0;margin-top:10px;',
      'padding:12px 18px 16px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);',
      'font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:12.5px;line-height:1.55;tab-size:2;}',
      '.sm-editor::placeholder{color:var(--dsw-alias-label-secondary);opacity:.7;}',
      '.sm-editor:disabled{opacity:.6;}',

      '.sm-foot{display:flex;align-items:center;gap:8px;padding:9px 12px 9px 18px;border-top:1px solid var(--dsw-alias-border-l1);}',
      '.sm-count{margin-right:auto;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.sm-count.warn{color:var(--dsw-alias-state-warn-primary);}',
      '.sm-count.over{color:var(--dsw-alias-state-error-primary);}',
      '.sm-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);',
      'border-radius:8px;padding:6px 11px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;}',
      '.sm-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);}',
      '.sm-btn:disabled{opacity:.4;cursor:default;}',
      '.sm-btn.primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff;}',
      '.sm-btn.primary:hover:not(:disabled){filter:brightness(1.06);background:var(--dsw-alias-brand-primary);}',
      '.sm-loading{padding:18px;font-size:12px;color:var(--dsw-alias-label-secondary);}',

      '@media (max-width:640px){',
      '.sm-backdrop{padding:0;align-items:end;}',
      '.sm-panel{width:100%;height:min(88vh,760px);border-radius:16px 16px 0 0;border-bottom:0;}',

      '}',
      "/* DSH panel polish v1 \u2014 graphite / ice; scoped, host-theme adaptive. */\n.sm-panel{--sm-ice:light-dark(#12678c,#98d9f5);--sm-ink:var(--dsw-alias-label-primary,#e7edf3);--sm-muted:var(--dsw-alias-label-secondary,#a1aebc);--sm-base:var(--dsw-alias-bg-base,#181d25);--sm-surface:color-mix(in srgb,var(--sm-base) 96%,var(--sm-ink));--sm-line:color-mix(in srgb,var(--sm-ink) 13%,transparent);--sm-hover:color-mix(in srgb,var(--sm-ice) 10%,var(--sm-surface));color:var(--sm-ink);container-type:inline-size;container-name:sm-panel;min-width:0;max-width:100%;font-size:13px;line-height:1.55;}\n.sm-panel,.sm-panel *{box-sizing:border-box;}\n.sm-title{font-weight:650;letter-spacing:-.025em;line-height:1.3;}\n.sm-btn,.sm-close,.sm-tab{min-height:32px;border-radius:9px;border-color:var(--sm-line);background:var(--sm-surface);color:var(--sm-ink);font-weight:550;line-height:1.3;transition:background-color 140ms ease,border-color 140ms ease,box-shadow 140ms ease;}\n.sm-btn:hover:not(:disabled),.sm-close:hover:not(:disabled),.sm-tab:hover:not(:disabled){background:var(--sm-hover);border-color:color-mix(in srgb,var(--sm-ice) 38%,var(--sm-line));filter:none;}\n.sm-btn:focus-visible,.sm-close:focus-visible,.sm-tab:focus-visible,.sm-editor:focus-visible{outline:2px solid var(--sm-ice);outline-offset:2px;}\n.sm-btn:disabled,.sm-close:disabled,.sm-tab:disabled,.sm-editor:disabled{opacity:.42;cursor:not-allowed;box-shadow:none;filter:none;transition:none;}\n.sm-btn:disabled:hover,.sm-close:disabled:hover,.sm-tab:disabled:hover{background:var(--sm-surface);border-color:var(--sm-line);}\n.sm-editor{border-radius:9px;border-color:var(--sm-line);color:var(--sm-ink);min-width:0;max-width:100%;font-size:12px;line-height:1.55;accent-color:var(--sm-ice);}\n.sm-label{font-size:10.5px;font-weight:600;letter-spacing:.055em;color:var(--sm-muted);opacity:1;}\n.sm-field{gap:6px;min-width:0;}\n.sm-btn.primary{background:var(--sm-ice);border-color:transparent;color:light-dark(#fff,#102633);font-weight:650;box-shadow:0 2px 5px #0000000c;}\n.sm-btn.primary:hover:not(:disabled){background:color-mix(in srgb,var(--sm-ice) 88%,var(--sm-ink));border-color:transparent;}\n.sm-btn.danger,.sm-iconbtn[data-danger=\"true\"]{color:var(--dsw-alias-state-error-primary,#dd646b);}\n.sm-btn.danger:hover:not(:disabled),.sm-iconbtn[data-danger=\"true\"]:hover:not(:disabled){color:var(--dsw-alias-state-error-primary,#dd646b);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dd646b) 12%,var(--sm-surface));border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dd646b) 35%,transparent);}\n@media (prefers-reduced-motion:reduce){.sm-panel *,.sm-panel *::before,.sm-panel *::after{transition:none!important;animation:none!important;scroll-behavior:auto!important;}}\n\n.sm-panel{border-radius:20px;border-color:var(--sm-line);background:var(--sm-surface);box-shadow:0 28px 90px #00000040;}\n.sm-head{padding:18px 20px 14px;border-color:var(--sm-line);}.sm-title{font-size:17px;}.sm-sub{margin-top:5px;}\n.sm-close{width:32px;height:32px;background:transparent;}.sm-tabs{padding:8px 14px;gap:5px;border:0;flex-wrap:wrap;}\n.sm-tab{border-radius:9px;padding:8px 12px;background:transparent;}.sm-tab[aria-selected=\"true\"]{background:var(--sm-hover);color:var(--sm-ice);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--sm-ice) 25%,transparent);}\n.sm-editor{padding:16px 20px;background:var(--sm-base);line-height:1.75;border-radius:0;}.sm-editor:focus-visible{outline-offset:-3px;}\n.sm-meta{padding:6px 20px;line-height:1.6;}.sm-foot{padding:12px 16px;gap:10px;border-color:var(--sm-line);flex-wrap:wrap;}\n.sm-count{font-variant-numeric:tabular-nums;}.sm-count.warn{color:var(--dsw-alias-state-warn-primary);}.sm-count.over{color:var(--dsw-alias-state-error-primary);}\n@container sm-panel (max-width:540px){.sm-head{padding:14px;}.sm-tabs{padding:6px 10px;}.sm-tab{flex:1;padding:8px;}.sm-editor{padding:14px;font-size:12px;}.sm-meta{padding:6px 14px;}.sm-count{flex-basis:100%;}.sm-foot{padding:10px;}}\n",
    ].join('');

    /**
     * Fetch one editor API result.
     * @param {string} path - path below /soul-memory.
     * @param {RequestInit} [options] - fetch options.
     * @returns {Promise<any>} parsed JSON.
     */
    async function request(path, options) {
      const init = {
        ...options,
        headers: {
          accept: 'application/json',
          ...(options && options.headers ? options.headers : {}),
        },
      };
      const response = await fetch('/soul-memory' + path, init);
      let data;
      try {
        data = await response.json();
      } catch (error) {
        data = { ok: false, error: 'HTTP ' + response.status };
      }
      if (!response.ok || data.ok === false) {
        throw new Error(data && data.error ? data.error : 'HTTP ' + response.status);
      }
      return data;
    }

    function formatChars(value) {
      return Number(value || 0).toLocaleString('en-US');
    }

    function PenIcon() {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: 16,
        height: 16,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M12 20h9' }),
        h('path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z' }),
      );
    }

    function Editor({ onClose }) {
      const [state, setState] = React.useState(null);
      const [target, setTarget] = React.useState('soul');
      const [text, setText] = React.useState('');
      const [original, setOriginal] = React.useState('');
      const [loading, setLoading] = React.useState(true);
      const [saving, setSaving] = React.useState(false);
      const [error, setError] = React.useState('');
      const [message, setMessage] = React.useState('');
      const textarea = React.useRef(null);
      const actions = React.useRef({});
      const flashTimer = React.useRef(null);

      const dirty = text !== original;
      const meta = TARGETS.find((item) => item.id === target) || TARGETS[0];
      const file = state && Array.isArray(state.files)
        ? state.files.find((item) => item.target === target)
        : null;
      const budget = file && Number.isFinite(file.budget) ? file.budget : 0;
      const chars = text.length;
      const memoryMode = target === 'user' || target === 'memory';
      const diskMemory = state && state.memory
        ? Number(state.memory.userChars || 0) + Number(state.memory.memoryChars || 0)
        : 0;
      const shownChars = memoryMode ? diskMemory - (file ? file.chars : 0) + chars : chars;
      const shownBudget = memoryMode
        ? (state && state.memory && Number.isFinite(state.memory.budget) ? state.memory.budget : 12000)
        : budget;
      const ratio = shownBudget > 0 ? shownChars / shownBudget : 0;
      const countClass = ratio > 1 ? 'sm-count over' : ratio > 0.8 ? 'sm-count warn' : 'sm-count';

      function flash(value) {
        setMessage(value);
        if (flashTimer.current !== null) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setMessage(''), 2400);
      }

      React.useEffect(() => () => {
        if (flashTimer.current !== null) clearTimeout(flashTimer.current);
      }, []);

      React.useEffect(() => {
        let alive = true;
        setLoading(true);
        setError('');
        setMessage('');
        Promise.all([
          request('/api/state'),
          request('/api/file?target=' + encodeURIComponent(target)),
        ]).then(([nextState, nextFile]) => {
          if (!alive) return;
          setState(nextState);
          setText(nextFile.content || '');
          setOriginal(nextFile.content || '');
          setLoading(false);
        }).catch((failure) => {
          if (!alive) return;
          setError(failure instanceof Error ? failure.message : String(failure));
          setLoading(false);
        });
        return () => {
          alive = false;
        };
      }, [target]);

      React.useEffect(() => {
        if (!loading && textarea.current) {
          textarea.current.focus();
          textarea.current.setSelectionRange(0, 0);
        }
      }, [loading, target]);

      function confirmDiscard() {
        return !dirty || window.confirm('Discard unsaved changes?');
      }

      function choose(next) {
        if (next === target) return;
        if (!confirmDiscard()) return;
        setTarget(next);
      }

      function close() {
        if (!confirmDiscard()) return;
        onClose();
      }

      function revert() {
        if (!dirty) return;
        if (!window.confirm('Revert to the saved version?')) return;
        setText(original);
        setMessage('Reverted');
      }

      async function save() {
        if (!dirty || saving || loading) return;
        setSaving(true);
        setError('');
        try {
          const result = await request('/api/file', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ target, content: text }),
          });
          if (result.state) setState(result.state);
          setOriginal(text);
          flash('Saved');
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
          setSaving(false);
        }
      }

      actions.current.save = save;
      actions.current.close = close;

      React.useEffect(() => {
        function onKey(event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            if (actions.current.close) actions.current.close();
            return;
          }
          if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 's') {
            event.preventDefault();
            if (actions.current.save) actions.current.save();
          }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, []);

      const status = loading
        ? 'Loading…'
        : saving
          ? 'Saving…'
          : message
            ? message
            : dirty
              ? 'Unsaved changes'
              : 'Saved';

      return h('div', {
        className: 'sm-backdrop',
        onMouseDown(event) {
          if (event.target === event.currentTarget) close();
        },
      },
        h('section', {
          className: 'sm-panel',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'sm-title',
        },
          h('header', { className: 'sm-head' },
            h('div', { className: 'sm-headtext' },
              h('div', { className: 'sm-title', id: 'sm-title' }, 'Soul & Memory'),
              h('div', { className: 'sm-sub' }, file ? file.path : '/soul-memory/api'),
            ),
            h('button', {
              type: 'button',
              className: 'sm-close',
              'aria-label': 'Close',
              onClick: close,
            }, '×'),
          ),
          h('nav', { className: 'sm-tabs', role: 'tablist', 'aria-label': 'Files' },
            TARGETS.map((item) => h('button', {
              key: item.id,
              type: 'button',
              role: 'tab',
              className: 'sm-tab',
              'aria-selected': item.id === target ? 'true' : 'false',
              onClick() { choose(item.id); },
            },
              item.label,
              h('span', null, item.file),
            )),
          ),
          h('div', { className: 'sm-meta' }, meta.hint),
          error ? h('div', { className: 'sm-error' }, error) : null,
          loading
            ? h('div', { className: 'sm-loading' }, 'Loading ' + meta.file + '…')
            : h('textarea', {
              ref: textarea,
              className: 'sm-editor',
              value: text,
              spellCheck: false,
              placeholder: meta.id === 'soul'
                ? '# Soul\n\nWho is this agent? How does it speak? What must it always do?'
                : meta.id === 'user'
                  ? '- Stable facts about the user\n- Preferences that should survive every session'
                  : '- Environment facts\n- Projects and working configurations\n- Lessons that were verified',
              onChange(event) {
                setText(event.target.value);
                setError('');
              },
            }),
          h('footer', { className: 'sm-foot' },
            h('span', { className: countClass, title: shownBudget > 0 ? 'Injected character budget' : '' },
              formatChars(shownChars) + (shownBudget > 0 ? ' / ' + formatChars(shownBudget) : '') + ' chars  ·  ' + status,
            ),
            h('button', {
              type: 'button',
              className: 'sm-btn',
              disabled: !dirty || loading || saving,
              onClick: revert,
            }, 'Revert'),
            h('button', {
              type: 'button',
              className: 'sm-btn primary',
              disabled: !dirty || loading || saving,
              onClick: save,
            }, saving ? 'Saving…' : 'Save'),
          ),
        ),
      );
    }

    function openEditor() {
      window.dispatchEvent(new window.Event('dsh:soul-memory-open'));
    }

    function SidebarAction() {
      return h('button', {
        type: 'button',
        className: 'sm-sidebar-action',
        title: '全域 Soul / User / Memory',
        'aria-label': '全域 Soul / User / Memory',
        'aria-haspopup': 'dialog',
        onClick: openEditor,
      }, h(PenIcon));
    }

    function SettingsSection() {
      return h('section', null,
        h('p', null, '編輯 DSH 全域 Soul / User / Memory；Bot 專屬設定請到各 Bot 設定。'),
        h('button', {
          type: 'button',
          className: 'sm-btn',
          onClick: openEditor,
        }, '開啟全域編輯器'),
      );
    }

    function Root() {
      const [open, setOpen] = React.useState(false);
      React.useEffect(() => {
        const onOpen = () => setOpen(true);
        window.addEventListener?.('dsh:soul-memory-open', onOpen);
        return () => window.removeEventListener?.('dsh:soul-memory-open', onOpen);
      }, []);
      React.useEffect(() => {
        let alive = true;
        let removeTheme;
        // rc.5 serves package-local client.*.js chunks through its owned loader.
        // Keep this independent from the editor so it cannot block editing.
        require.async('./client.ui-shell.js').then((theme) => {
          if (alive) removeTheme = theme.mount(document);
        }).catch((error) => {
          console.warn('[soul-memory] UI theme unavailable; native theme retained', error);
        });
        return () => {
          alive = false;
          if (removeTheme) removeTheme();
        };
      }, []);
      return h(React.Fragment, null,
        h('style', null, CSS),

        open ? h(Editor, { onClose() { setOpen(false); } }) : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'soul-memory-editor',
          order: 30,
          label: () => '全域 Soul / User / Memory',
        }, SidebarAction));
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'soul-memory',
          order: 30,
          label: () => '全域 Soul / User / Memory',
        }, SettingsSection));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'soul-memory-editor',
          order: 95,
        }, Root));
      },
    };
  },
});
