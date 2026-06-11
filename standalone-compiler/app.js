// ============================================================
// Standalone Python Compiler — app.js
// ============================================================

let editor    = null;
let worker    = null;
let isRunning = false;

// File state
let files        = [];
let activeFileId = null;

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initServiceWorker();
  initTheme();
  initFiles();
  initEditor();
  initWorker();
  initResizer();
  initToasts();
  initMobileNav();
});

// ============================================================
// Service Worker Registration
// ============================================================
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        console.log('Stdin Service Worker registered:', reg.scope);
      })
      .catch(err => {
        console.error('Stdin Service Worker registration failed:', err);
      });
  }
}

// ============================================================
// Theme Toggle
// ============================================================
function initTheme() {
  const btn  = document.getElementById('themeToggleBtn');
  const icon = document.getElementById('themeIcon');
  if (!btn) return;

  const moonPath = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"/>';
  const sunPath  = `<circle cx="12" cy="12" r="5" fill="currentColor"/>
    <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;

  // Detect system color scheme preference
  let light = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;

  // Set initial theme
  document.body.classList.toggle('light', light);
  icon.innerHTML = light ? sunPath : moonPath;

  btn.addEventListener('click', () => {
    light = !light;
    document.body.classList.toggle('light', light);
    icon.innerHTML = light ? sunPath : moonPath;
    if (editor) editor.setOption('theme', light ? 'default' : 'darcula');
  });
}

// ============================================================
// Toast Notifications
// ============================================================
let toastEl;
function initToasts() { toastEl = document.getElementById('toastContainer'); }

function showToast(msg, type = 'info') {
  if (!toastEl) return;
  const t = document.createElement('div');
  t.className   = 'toast';
  t.textContent = msg;
  const c = { success: '#89d185', error: '#f48771', warning: '#cca700', info: '#007acc' };
  t.style.borderLeftColor = c[type] || c.info;
  toastEl.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .4s, transform .4s';
    t.style.opacity    = '0';
    t.style.transform  = 'translateX(110%)';
    setTimeout(() => t.remove(), 400);
  }, 3500);
}

// ============================================================
// Pyodide Worker
// ============================================================
let _uiBound = false;

function initWorker() {
  if (worker) return;

  const out    = document.getElementById('consoleOutput');
  const dot    = document.getElementById('consoleStatusDot');
  const label  = document.getElementById('statusLabel');
  const runBtn = document.getElementById('runCodeBtn');
  const stpBtn = document.getElementById('stopCodeBtn');
  const isRestart = _uiBound;

  function setStatus(cls, text) {
    dot.className = `status-dot ${cls}`;
    if (label) label.textContent = text;
  }

  function setRunning(running) {
    isRunning = running;
    runBtn.classList.toggle('hidden', running);
    stpBtn.classList.toggle('hidden', !running);
  }

  runBtn.disabled = true;
  setStatus('loading', 'Initializing…');

  worker = new Worker('pyodide-worker.js');
  worker.postMessage({ type: 'init' });

  worker.onmessage = ({ data }) => {
    const { type, content, message } = data;

    switch (type) {
      case 'status':
        if (!isRestart) out.innerHTML = `<span class="sys">${message}</span>`;
        setStatus('loading', message);
        break;

      case 'ready':
        if (!isRestart) out.innerHTML = '<span class="sys">✓ Python ready — press ▶ Run</span>';
        setStatus('ready', 'Ready');
        runBtn.disabled = false;
        setRunning(false);
        break;

      case 'start':
        // Append a run divider (never wipe the output)
        if (out.children.length > 0) {
          const d = document.createElement('span');
          d.className   = 'sys';
          d.textContent = '\n─── Run ─────────────>\n';
          out.appendChild(d);
        }
        setStatus('running', 'Running…');
        setRunning(true);
        break;

      case 'stdout': {
        const s = document.createElement('span');
        s.className   = 'out';
        s.textContent = content;
        out.appendChild(s);
        out.scrollTop = out.scrollHeight;
        break;
      }

      case 'stderr': {
        const s = document.createElement('span');
        s.className   = 'err';
        s.textContent = content;
        out.appendChild(s);
        out.scrollTop = out.scrollHeight;
        break;
      }

      case 'error': {
        const s = document.createElement('span');
        s.className   = 'errblock';
        s.textContent = '\n' + content;
        out.appendChild(s);
        out.scrollTop = out.scrollHeight;
        setStatus('error', 'Error');
        setRunning(false);
        break;
      }

      case 'success':
        setStatus('ready', 'Done ✓');
        setRunning(false);
        break;

      case 'input_request':
        showInlineInput(out, data.prompt);
        break;
    }
  };

  // Bind buttons only once
  if (!_uiBound) {
    _uiBound = true;

    // Clear
    document.getElementById('clearOutputBtn')?.addEventListener('click', () => {
      out.innerHTML = '';
    });

    // Stop
    stpBtn.addEventListener('click', () => {
      if (!worker) return;
      worker.terminate();
      worker = null;

      // Abort any pending inputs
      fetch('clear-stdin').catch(() => {});
      out.querySelectorAll('.terminal-inline-input').forEach(el => {
        el.disabled = true;
        el.placeholder = ' [Stopped]';
        el.style.borderBottom = 'none';
      });

      const s = document.createElement('span');
      s.className   = 'errblock';
      s.textContent = '\n[Stopped by user]';
      out.appendChild(s);
      out.scrollTop = out.scrollHeight;

      setStatus('error', 'Stopped');
      setRunning(false);
      showToast('Execution stopped', 'info');
      initWorker();   // restart silently
    });

    // Run
    runBtn.addEventListener('click', () => {
      if (isRunning || !editor) return;
      const code = editor.getValue().trim();
      if (!code)   { showToast('Write some code first!', 'warning'); return; }
      if (!worker) { showToast('Worker not ready yet',   'error');   return; }

      // Clear terminal output screen automatically
      out.innerHTML = '';

      // Clear any pending stdin requests
      fetch('clear-stdin').catch(() => {});

      worker.postMessage({ type: 'run', code });

      // Auto-switch to Output tab on mobile viewports
      if (window.innerWidth <= 768) {
        const tabTerminal = document.getElementById('mobileTabTerminal');
        if (tabTerminal) tabTerminal.click();
      }
    });
  }
}

// ============================================================
// Inline Terminal Input handler
// ============================================================
function showInlineInput(container, promptText) {
  const row = document.createElement('div');
  row.className = 'terminal-input-row';

  if (promptText) {
    const promptSpan = document.createElement('span');
    promptSpan.className = 'out';
    promptSpan.textContent = promptText;
    row.appendChild(promptSpan);
  }

  const inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.className = 'terminal-inline-input';
  inputEl.autocomplete = 'off';
  inputEl.spellcheck = false;

  row.appendChild(inputEl);
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;

  // Auto focus the input
  setTimeout(() => inputEl.focus(), 10);

  // Focus it on click anywhere in the terminal
  const refocuser = () => inputEl.focus();
  container.addEventListener('click', refocuser);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = inputEl.value;

      container.removeEventListener('click', refocuser);

      // Submit value to service worker
      fetch('submit-stdin?value=' + encodeURIComponent(val))
        .catch(err => console.error('Failed to submit stdin:', err));

      // Replace input element with plain text to preserve history
      row.innerHTML = '';
      if (promptText) {
        const promptSpan = document.createElement('span');
        promptSpan.className = 'out';
        promptSpan.textContent = promptText;
        row.appendChild(promptSpan);
      }
      const textSpan = document.createElement('span');
      textSpan.className = 'out';
      textSpan.textContent = val + '\n';
      row.appendChild(textSpan);

      container.scrollTop = container.scrollHeight;
    }
  });
}


// ============================================================
// File Management (localStorage)
// ============================================================
const DEFAULT_TEMPLATE = `# Welcome to Brototype Code to Career Challenge

def greet(name):
    return f"Hello {name}, let's code!"

print(greet("Developer"))
`;

function initFiles() {
  try {
    const saved = localStorage.getItem('ctc_files');
    files = saved ? JSON.parse(saved) : [];
  } catch { files = []; }

  if (files.length === 0)
    files.push({ id: uid(), name: 'main.py', content: DEFAULT_TEMPLATE });

  const savedId = localStorage.getItem('ctc_active');
  activeFileId  = (savedId && files.find(f => f.id === savedId)) ? savedId : files[0].id;

  document.getElementById('newFileBtn').addEventListener('click', newFile);
  renderFiles();
}

function persist() {
  localStorage.setItem('ctc_files',  JSON.stringify(files));
  localStorage.setItem('ctc_active', activeFileId);
}

function uid() { return 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }
function activeFile() { return files.find(f => f.id === activeFileId); }

function newFile() {
  let name = prompt('File name (.py):', 'script.py');
  if (!name) return;
  name = name.trim();
  if (!name.endsWith('.py')) name += '.py';
  const f = { id: uid(), name, content: '' };
  files.push(f);
  activeFileId = f.id;
  persist(); renderFiles();
  if (editor) editor.setValue('');
}

function switchFile(id) {
  if (activeFileId === id) return;
  const cur = activeFile();
  if (cur && editor) cur.content = editor.getValue();
  activeFileId = id;
  persist(); renderFiles();
  const f = activeFile();
  if (editor && f) editor.setValue(f.content);

  // Close mobile sidebar drawer if open
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && sidebar.classList.contains('mobile-open')) {
    sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
  }
}

function deleteFile(id, e) {
  e.stopPropagation();
  if (files.length === 1) { showToast('Cannot delete the last file.', 'warning'); return; }
  if (!confirm('Delete this file?')) return;
  files = files.filter(f => f.id !== id);
  if (activeFileId === id) {
    activeFileId = files[0].id;
    if (editor) editor.setValue(files[0].content);
  }
  persist(); renderFiles();
}

function saveContent(content) {
  const f = activeFile();
  if (!f) return;
  f.content = content;
  persist();
  const el = document.getElementById('saveStatus');
  if (el) {
    el.classList.add('visible');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('visible'), 1500);
  }
}

function renderFiles() {
  const sidebar = document.getElementById('sidebarFileList');
  const tabs    = document.getElementById('editorTabsContainer');
  sidebar.innerHTML = '';
  tabs.innerHTML    = '';

  files.forEach(f => {
    const active = f.id === activeFileId;
    const pyIcon = `<svg viewBox="0 0 24 24" width="15" height="15" fill="#f5c009">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 3.5L18.5 9H15V5.5zM6 20V4h7v7h7v9H6z"/>
    </svg>`;

    // Sidebar row
    const row = document.createElement('div');
    row.className = `file-item${active ? ' active' : ''}`;
    row.addEventListener('click', () => switchFile(f.id));
    const ico = document.createElement('span'); ico.innerHTML = pyIcon;
    const lbl = document.createElement('span'); lbl.textContent = f.name; lbl.style.flex = '1';
    const del = document.createElement('button');
    del.className = 'delete-file-btn'; del.textContent = '✕';
    del.addEventListener('click', e => deleteFile(f.id, e));
    row.append(ico, lbl, del);
    sidebar.appendChild(row);

    // Tab
    const tab = document.createElement('div');
    tab.className = `tab${active ? ' active' : ''}`;
    tab.innerHTML = `${pyIcon} ${f.name}`;
    tab.addEventListener('click', () => switchFile(f.id));
    tabs.appendChild(tab);
  });
}

// ============================================================
// Editor (CodeMirror)
// ============================================================
function initEditor() {
  const textarea = document.getElementById('codeEditor');
  if (!textarea) return;

  const isLight = document.body.classList.contains('light');
  editor = CodeMirror.fromTextArea(textarea, {
    mode: 'python', theme: isLight ? 'default' : 'darcula',
    lineNumbers: true, indentUnit: 4, tabSize: 4,
    lineWrapping: false, autofocus: true,
  });

  const f = activeFile();
  if (f) editor.setValue(f.content);
  editor.on('change', () => saveContent(editor.getValue()));
}

// ============================================================
// Terminal Resizer
// ============================================================
function initResizer() {
  const handle    = document.getElementById('terminalResizer');
  const terminal  = document.getElementById('terminalArea');
  const workspace = document.querySelector('.main-content');
  if (!handle || !terminal || !workspace) return;

  let dragging = false;

  handle.addEventListener('mousedown', e => {
    dragging = true; e.preventDefault();
    handle.classList.add('dragging');
    document.body.style.cursor = document.body.style.userSelect = '';
    document.body.style.cursor    = 'ns-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const box  = workspace.getBoundingClientRect();
    const newH = Math.round(box.bottom - e.clientY);
    if (newH >= 120 && newH <= box.height * 0.75)
      terminal.style.height = `${newH}px`;
    if (editor) editor.refresh();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = document.body.style.userSelect = '';
    if (editor) editor.refresh();
  });
}

// ============================================================
// Mobile Navigation and Switching Logic
// ============================================================
function initMobileNav() {
  const tabEditor = document.getElementById('mobileTabEditor');
  const tabTerminal = document.getElementById('mobileTabTerminal');
  const mainContent = document.querySelector('.main-content');

  const sidebarBtn = document.getElementById('sidebarToggleBtn');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (tabEditor && tabTerminal && mainContent) {
    tabEditor.addEventListener('click', () => {
      tabEditor.classList.add('active');
      tabTerminal.classList.remove('active');
      mainContent.classList.add('mobile-show-editor');
      mainContent.classList.remove('mobile-show-terminal');
      
      // Crucial: refresh CodeMirror editor to recalculate width/height on view toggle
      if (editor) {
        setTimeout(() => editor.refresh(), 50);
      }
    });

    tabTerminal.addEventListener('click', () => {
      tabTerminal.classList.add('active');
      tabEditor.classList.remove('active');
      mainContent.classList.add('mobile-show-terminal');
      mainContent.classList.remove('mobile-show-editor');
    });
  }

  // Sidebar slide-out toggle
  if (sidebarBtn && sidebar && overlay) {
    sidebarBtn.addEventListener('click', () => {
      if (window.innerWidth > 768) {
        sidebar.classList.toggle('collapsed');
        if (editor) {
          setTimeout(() => editor.refresh(), 50);
        }
      } else {
        sidebar.classList.toggle('mobile-open');
        overlay.classList.toggle('active');
      }
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });
  }

  // Activity Bar Explorer toggle for desktop
  const explorerTab = document.querySelector('.activity-bar .action-item');
  if (explorerTab && sidebar) {
    explorerTab.addEventListener('click', () => {
      if (window.innerWidth > 768) {
        sidebar.classList.toggle('collapsed');
        if (editor) {
          setTimeout(() => editor.refresh(), 50);
        }
      }
    });
  }
}
