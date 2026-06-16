// Brototype Python Playground — Main UI & Logic script
// const API_BASE_URL = 'http://localhost:3000';
const API_BASE_URL = 'https://ctc.brototype.com';


// Global state
let currentUser = null;
let currentToken = null;
let iti = null;
let currentLessons = [];
let selectedLesson = null;
let editor = null;
let worker = null;
let isRunning = false;
let files = [];
let activeFileId = null;
let resendTimerInterval = null;
let _uiBound = false;

// Admin views state
let adminToken = null;
let leadsCurrentPage = 1;
let leadsTotalPages = 1;

// Determine if we are on the Admin portal or the Playground
function checkIsAdminPage() {
  return window.location.pathname.includes('admin.html') ||
    window.location.pathname.includes('/admin') ||
    document.getElementById('adminLoginForm') !== null;
}

function initPage() {
  initToasts();
  initTheme();

  if (checkIsAdminPage()) {
    initAdminPage();
  } else {
    initPlaygroundPage();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}

// --------------------------------------------------------------------------
// Toast Notification Utility
// --------------------------------------------------------------------------
let toastContainer;
function initToasts() {
  toastContainer = document.getElementById('toastContainer');
}

function showToast(message, type = 'info') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;

  // Custom styling based on toast type
  if (type === 'success') {
    toast.style.borderLeftColor = 'var(--success-color)';
  } else if (type === 'error') {
    toast.style.borderLeftColor = 'var(--error-color)';
  } else if (type === 'warning') {
    toast.style.borderLeftColor = 'var(--warning-color)';
  }

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.5s ease';
    setTimeout(() => {
      toast.remove();
    }, 500);
  }, 4000);
}

// --------------------------------------------------------------------------
// View Switcher Utility
// --------------------------------------------------------------------------
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active');
  }
}

// --------------------------------------------------------------------------
// PLAYGROUND PAGE LOGIC
// --------------------------------------------------------------------------
function initPlaygroundPage() {
  // 1. Capture UTM/Attribution properties from URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const sourceId = urlParams.get('source_id');
  const sourceUrl = urlParams.get('source_url') || window.location.href;

  if (sourceId) {
    localStorage.setItem('lead_source_id', sourceId);
  }
  if (sourceUrl) {
    localStorage.setItem('lead_source_url', sourceUrl);
  }

  // 2. DOM Elements & Selection
  const signupForm = document.getElementById('signupForm');
  const otpForm = document.getElementById('otpForm');
  const logoutBtn = document.getElementById('logoutBtn');
  const changePhoneBtn = document.getElementById('changePhoneBtn');
  const resendOtpBtn = document.getElementById('resendOtpBtn');

  const authToggleBtn = document.getElementById('authToggleBtn');
  const authTogglePrefix = document.getElementById('authTogglePrefix');
  const authTitle = document.getElementById('authTitle');
  const authSubtitle = document.getElementById('authSubtitle');
  const authSubmitText = document.getElementById('authSubmitText');

  const nameFieldGroup = document.getElementById('nameFieldGroup');
  const qualificationFieldGroup = document.getElementById('qualificationFieldGroup');
  const consentFieldGroup = document.getElementById('consentFieldGroup');

  const fullNameInput = document.getElementById('fullName');
  const qualificationInput = document.getElementById('qualification');
  const consentInput = document.getElementById('marketingConsent');

  try {
    const phoneInputEl = document.getElementById('phoneNumber');
    if (phoneInputEl) {
      if (typeof window.intlTelInput !== 'function') {
        throw new Error("window.intlTelInput is not loaded yet or is not a function.");
      }
      iti = window.intlTelInput(phoneInputEl, {
        initialCountry: "in",
        separateDialCode: true,
        dropdownParent: document.body,
        utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js",
      });
      console.log("[INTL-TEL-INPUT] Initialized successfully:", iti);
    } else {
      console.warn("[INTL-TEL-INPUT] Input element #phoneNumber not found.");
    }
  } catch (err) {
    console.error("[INTL-TEL-INPUT] Initialization error:", err);
    setTimeout(() => {
      showToast("WhatsApp input initialization error: " + err.message, "error");
    }, 800);
  }

  let isLoginMode = false;

  if (authToggleBtn) {
    authToggleBtn.addEventListener('click', () => {
      isLoginMode = !isLoginMode;
      const marketingFeatures = document.getElementById('marketingFeatures');
      if (isLoginMode) {
        if (authTitle) authTitle.innerText = "Login to Code Editor";
        if (authSubtitle) authSubtitle.innerText = "Access the Code Editor and start practicing.";
        if (authSubmitText) authSubmitText.innerText = "Send Login Code";
        if (authTogglePrefix) authTogglePrefix.innerText = "Need a new account? ";
        authToggleBtn.innerText = "Sign Up";

        if (nameFieldGroup) nameFieldGroup.style.display = 'none';
        if (qualificationFieldGroup) qualificationFieldGroup.style.display = 'none';
        if (consentFieldGroup) consentFieldGroup.style.display = 'none';
        if (marketingFeatures) marketingFeatures.style.display = 'none';

        if (fullNameInput) fullNameInput.required = false;
        if (qualificationInput) qualificationInput.required = false;
        if (consentInput) consentInput.required = false;
      } else {
        if (authTitle) authTitle.innerText = "Signup to Code Editor";
        if (authSubtitle) authSubtitle.innerText = "Access the Code Editor and start practicing.";
        if (authSubmitText) authSubmitText.innerText = "Send WhatsApp Verification";
        if (authTogglePrefix) authTogglePrefix.innerText = "Already registered? ";
        authToggleBtn.innerText = "Log In";

        if (nameFieldGroup) nameFieldGroup.style.display = 'block';
        if (qualificationFieldGroup) qualificationFieldGroup.style.display = 'block';
        if (consentFieldGroup) consentFieldGroup.style.display = 'flex';
        if (marketingFeatures) marketingFeatures.style.display = 'flex';

        if (fullNameInput) fullNameInput.required = true;
        if (qualificationInput) qualificationInput.required = true;
        if (consentInput) consentInput.required = true;
      }
    });
  }

  // 3. Navigation Check
  currentToken = localStorage.getItem('user_token');
  const storedUser = localStorage.getItem('user_data');

  if (currentToken && storedUser) {
    currentUser = JSON.parse(storedUser);
    if (logoutBtn) logoutBtn.style.display = 'block';
    document.body.classList.add('playground-active');
    switchView('playgroundView');
    initServiceWorker();
    initFiles();
    initEditor();
    initWorker();
    initResizer();
    initMobileNav();
  } else {
    if (logoutBtn) logoutBtn.style.display = 'none';
    switchView('signupView');
  }

  // 4. Form Submissions
  // A. Signup/Login Submit
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!iti) return;

    if (!iti.isValidNumber()) {
      showToast("Please enter a valid WhatsApp phone number.", "error");
      return;
    }

    const phoneE164 = iti.getNumber();

    localStorage.setItem('pending_signup_phone', phoneE164);
    localStorage.setItem('pending_is_login_mode', isLoginMode ? 'true' : 'false');

    if (!isLoginMode) {
      const name = fullNameInput.value.trim();
      const qualification = qualificationInput.value;
      const consent = consentInput.checked;

      localStorage.setItem('pending_signup_name', name);
      localStorage.setItem('pending_signup_qualification', qualification);
      localStorage.setItem('pending_signup_consent', consent ? 'true' : 'false');
    } else {
      localStorage.removeItem('pending_signup_name');
      localStorage.removeItem('pending_signup_qualification');
      localStorage.removeItem('pending_signup_consent');
    }

    const submitBtn = document.getElementById('signupSubmitBtn');
    submitBtn.disabled = true;
    const originalText = authSubmitText.innerText;
    authSubmitText.innerText = "Sending Code...";

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneE164, isLogin: isLoginMode })
      });

      const data = await response.json();

      if (response.ok) {
        showToast("OTP sent to your WhatsApp!", "success");
        document.getElementById('otpSubtitle').innerText = `We sent a 6-digit verification code to ${phoneE164}`;
        switchView('otpView');
        startResendTimer();

        // Auto-fill OTP in console for easy mock testing
        if (data.mock_otp) {
          console.log(`[LOCAL DEV] Simulated OTP received: ${data.mock_otp}`);
          showToast(`[Mock OTP Received: ${data.mock_otp}]`, "warning");
        }

        // Focus first OTP field
        document.querySelector('.otp-digit').focus();
      } else {
        showToast(data.error || "Failed to transmit OTP.", "error");
        if (data.userExists && !isLoginMode) {
          setTimeout(() => {
            showToast("Switching to Log In mode...", "info");
            if (authToggleBtn) authToggleBtn.click();
          }, 1500);
        } else if (data.userNotFound && isLoginMode) {
          setTimeout(() => {
            showToast("Switching to Sign Up mode...", "info");
            if (authToggleBtn) authToggleBtn.click();
          }, 1500);
        }
      }
    } catch (error) {
      console.error(error);
      showToast("Server unreachable. Ensure backend service is running.", "error");
    } finally {
      submitBtn.disabled = false;
      authSubmitText.innerText = originalText;
    }
  });

  // B. OTP input autofocus logic
  const otpDigits = document.querySelectorAll('.otp-digit');
  otpDigits.forEach((digitInput, idx) => {
    digitInput.addEventListener('input', (e) => {
      const value = e.target.value;
      if (value.length === 1 && idx < otpDigits.length - 1) {
        otpDigits[idx + 1].focus();
      }
    });

    digitInput.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        otpDigits[idx - 1].focus();
      }
    });
  });

  // C. OTP Verification Verify
  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    let otp = '';
    otpDigits.forEach(input => otp += input.value);

    if (otp.length !== 6) {
      showToast("Please enter a 6-digit OTP code.", "error");
      return;
    }

    const phone = localStorage.getItem('pending_signup_phone');
    const isLogin = localStorage.getItem('pending_is_login_mode') === 'true';

    let payload = { phone, otp };

    if (!isLogin) {
      payload.name = localStorage.getItem('pending_signup_name');
      payload.qualification = localStorage.getItem('pending_signup_qualification');
      payload.consent = localStorage.getItem('pending_signup_consent') === 'true';
    }

    const source_id = localStorage.getItem('lead_source_id');
    const source_url = localStorage.getItem('lead_source_url');
    if (source_id) payload.source_id = source_id;
    if (source_url) payload.source_url = source_url;

    const verifyBtn = document.getElementById('otpVerifyBtn');
    verifyBtn.disabled = true;
    verifyBtn.innerText = "Verifying...";

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        showToast("Verification successful!", "success");

        // Save sessions
        localStorage.setItem('user_token', data.token);
        localStorage.setItem('user_data', JSON.stringify(data.user));
        currentToken = data.token;
        currentUser = data.user;

        // Cleanup temp signup state
        localStorage.removeItem('pending_signup_name');
        localStorage.removeItem('pending_signup_phone');
        localStorage.removeItem('pending_signup_qualification');
        localStorage.removeItem('pending_signup_consent');
        localStorage.removeItem('pending_is_login_mode');

        if (logoutBtn) logoutBtn.style.display = 'block';
        document.body.classList.add('playground-active');
        switchView('playgroundView');
        initServiceWorker();
        initFiles();
        initEditor();
        initWorker();
        initResizer();
        initMobileNav();
      } else {
        // If login fails because user doesn't exist, switch to signup
        if (isLogin && data.error && data.error.includes("Signup requires")) {
          showToast("Account not found. Switching to Sign Up mode.", "warning");
          if (isLoginMode) {
            authToggleBtn.click();
          }
          switchView('signupView');
        } else {
          showToast(data.error || "Verification failed.", "error");
        }
      }
    } catch (error) {
      console.error(error);
      showToast("Server connection error during verification.", "error");
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.innerText = "Verify & Start Learning";
    }
  });

  // D. Resend OTP Button click
  resendOtpBtn.addEventListener('click', async () => {
    const phone = localStorage.getItem('pending_signup_phone');
    if (!phone) return;

    const isLogin = localStorage.getItem('pending_is_login_mode') === 'true';
    resendOtpBtn.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, isLogin })
      });

      const data = await response.json();

      if (response.ok) {
        showToast("New OTP sent successfully!", "success");
        startResendTimer();
        if (data.mock_otp) {
          showToast(`[Mock OTP: ${data.mock_otp}]`, "warning");
        }
      } else {
        showToast(data.error || "Failed to resend code.", "error");
        resendOtpBtn.disabled = false;
      }
    } catch (error) {
      showToast("Failed to connect to backend service.", "error");
      resendOtpBtn.disabled = false;
    }
  });

  // E. Change Phone Number Link
  changePhoneBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (resendTimerInterval) clearInterval(resendTimerInterval);
    switchView('signupView');
  });

  // F. User Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_data');
      currentUser = null;
      currentToken = null;
      if (worker) {
        worker.terminate();
        worker = null;
      }
      logoutBtn.style.display = 'none';
      document.body.classList.remove('playground-active');
      document.body.classList.remove('light');
      switchView('signupView');
      showToast("Logged out of session.", "info");
    });
  }
}

function startResendTimer() {
  const btn = document.getElementById('resendOtpBtn');
  btn.disabled = true;
  let seconds = 30;

  if (resendTimerInterval) clearInterval(resendTimerInterval);

  resendTimerInterval = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(resendTimerInterval);
      btn.innerText = "Resend OTP";
      btn.disabled = false;
    } else {
      btn.innerText = `Resend in ${seconds}s`;
    }
  }, 1000);
}

// --------------------------------------------------------------------------
// Service Worker Registration
// --------------------------------------------------------------------------
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

// --------------------------------------------------------------------------
// Theme Toggle
// --------------------------------------------------------------------------
function initTheme() {
  const buttons = document.querySelectorAll('.theme-toggle-btn, #themeToggleBtn');
  if (buttons.length === 0) return;

  const moonPath = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"/>';
  const sunPath = `<circle cx="12" cy="12" r="5" fill="currentColor"/>
    <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;

  // Detect system color scheme preference or use saved preference
  let savedTheme = localStorage.getItem('theme');
  let light;
  if (savedTheme) {
    light = savedTheme === 'light';
  } else {
    light = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  const updateTheme = () => {
    document.body.classList.toggle('light', light);
    localStorage.setItem('theme', light ? 'light' : 'dark');
    buttons.forEach(b => {
      const icon = b.querySelector('svg');
      if (icon) icon.innerHTML = light ? sunPath : moonPath;
    });

    // Toggle logo source URLs for dark and light theme
    const darkLogo = "https://website-main.blr1.cdn.digitaloceanspaces.com/marketing-landingpage-files/BrototypeLogos/brototype_without_tagline_white_log_svg.svg";
    const lightLogo = "https://website-main.blr1.cdn.digitaloceanspaces.com/marketing-landingpage-files/BrototypeLogos/brototype-white-theme.svg";
    const logos = document.querySelectorAll('.theme-logo');
    logos.forEach(logo => {
      logo.src = light ? lightLogo : darkLogo;
    });

    if (editor) {
      editor.setOption('theme', light ? 'default' : 'material-darker');
    }
  };

  updateTheme();

  buttons.forEach(b => {
    b.onclick = (e) => {
      e.preventDefault();
      light = !light;
      updateTheme();
    };
  });
}

// --------------------------------------------------------------------------
// Pyodide Web Assembly Compiler Integration
// --------------------------------------------------------------------------
function initWorker() {
  if (worker) return;

  const out = document.getElementById('consoleOutput');
  const dot = document.getElementById('consoleStatusDot');
  const label = document.getElementById('statusLabel');
  const runBtn = document.getElementById('runCodeBtn');
  const stpBtn = document.getElementById('stopCodeBtn');
  const isRestart = _uiBound;

  function setStatus(cls, text) {
    if (dot) dot.className = `status-dot ${cls}`;
    if (label) label.textContent = text;
  }

  function setRunning(running) {
    isRunning = running;
    if (runBtn) runBtn.classList.toggle('hidden', running);
    if (stpBtn) stpBtn.classList.toggle('hidden', !running);
  }

  if (runBtn) runBtn.disabled = true;
  setStatus('loading', 'Initializing…');

  worker = new Worker('pyodide-worker.js');
  worker.postMessage({ type: 'init' });

  worker.onmessage = ({ data }) => {
    const { type, content, message } = data;

    switch (type) {
      case 'status':
        if (!isRestart && out) out.innerHTML = `<span class="sys">${message}</span>`;
        setStatus('loading', message);
        break;

      case 'ready':
        if (!isRestart && out) out.innerHTML = '<span class="sys">✓ Editor ready — press ▶ Run</span>';
        setStatus('ready', 'Ready');
        if (runBtn) runBtn.disabled = false;
        setRunning(false);
        break;

      case 'start':
        if (out) {
          if (out.children.length > 0) {
            const d = document.createElement('span');
            d.className = 'sys';
            d.textContent = '\n─── Run ─────────────>\n';
            out.appendChild(d);
          }
        }
        setStatus('running', 'Running…');
        setRunning(true);
        break;

      case 'stdout': {
        if (out) {
          const s = document.createElement('span');
          s.className = 'out';
          s.textContent = content;
          out.appendChild(s);
          out.scrollTop = out.scrollHeight;
        }
        break;
      }

      case 'stderr': {
        if (out) {
          const s = document.createElement('span');
          s.className = 'err';
          s.textContent = content;
          out.appendChild(s);
          out.scrollTop = out.scrollHeight;
        }
        break;
      }

      case 'error': {
        if (out) {
          const s = document.createElement('span');
          s.className = 'errblock';
          s.textContent = '\n' + content;
          out.appendChild(s);
          out.scrollTop = out.scrollHeight;
        }
        setStatus('error', 'Error');
        setRunning(false);
        break;
      }

      case 'success':
        setStatus('ready', 'Done ✓');
        setRunning(false);
        break;

      case 'input_request':
        if (out) showInlineInput(out, data.prompt);
        break;
    }
  };

  if (!_uiBound) {
    _uiBound = true;

    document.getElementById('clearOutputBtn')?.addEventListener('click', () => {
      if (out) out.innerHTML = '';
    });

    if (stpBtn) {
      stpBtn.addEventListener('click', () => {
        if (!worker) return;
        worker.terminate();
        worker = null;

        fetch('clear-stdin').catch(() => { });
        if (out) {
          out.querySelectorAll('.terminal-inline-input').forEach(el => {
            el.disabled = true;
            el.placeholder = ' [Stopped]';
            el.style.borderBottom = 'none';
          });

          const s = document.createElement('span');
          s.className = 'errblock';
          s.textContent = '\n[Stopped by user]';
          out.appendChild(s);
          out.scrollTop = out.scrollHeight;
        }

        setStatus('error', 'Stopped');
        setRunning(false);
        showToast('Execution stopped', 'info');
        initWorker();
      });
    }

    if (runBtn) {
      runBtn.addEventListener('click', () => {
        if (isRunning || !editor) return;
        const f = activeFile();
        const code = f ? f.content.trim() : editor.getValue().trim();
        if (!code) { showToast('Write some code first!', 'warning'); return; }
        if (!worker) { showToast('Worker not ready yet', 'error'); return; }

        if (out) out.innerHTML = '';
        fetch('clear-stdin').catch(() => { });

        worker.postMessage({ type: 'run', code });

        if (window.innerWidth <= 768) {
          const tabTerminal = document.getElementById('mobileTabTerminal');
          if (tabTerminal) tabTerminal.click();
        }
      });
    }
  }
}

// --------------------------------------------------------------------------
// Inline Terminal Input handler
// --------------------------------------------------------------------------
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

  setTimeout(() => inputEl.focus(), 10);

  const refocuser = () => inputEl.focus();
  container.addEventListener('click', refocuser);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = inputEl.value;

      container.removeEventListener('click', refocuser);

      fetch('submit-stdin?value=' + encodeURIComponent(val))
        .catch(err => console.error('Failed to submit stdin:', err));

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

// --------------------------------------------------------------------------
// File Management (localStorage)
// --------------------------------------------------------------------------
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
  activeFileId = (savedId && files.find(f => f.id === savedId)) ? savedId : files[0].id;

  const newFileBtn = document.getElementById('newFileBtn');
  if (newFileBtn) {
    newFileBtn.onclick = newFile;
  }
  renderFiles();
}

function persist() {
  localStorage.setItem('ctc_files', JSON.stringify(files));
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
  const tabs = document.getElementById('editorTabsContainer');
  if (!sidebar || !tabs) return;
  sidebar.innerHTML = '';
  tabs.innerHTML = '';

  files.forEach(f => {
    const active = f.id === activeFileId;
    const pyIcon = `<svg viewBox="0 0 24 24" width="15" height="15" fill="#f5c009">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 3.5L18.5 9H15V5.5zM6 20V4h7v7h7v9H6z"/>
    </svg>`;

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

    const tab = document.createElement('div');
    tab.className = `tab${active ? ' active' : ''}`;
    tab.innerHTML = `${pyIcon} ${f.name}`;
    tab.addEventListener('click', () => switchFile(f.id));
    tabs.appendChild(tab);
  });
}

// --------------------------------------------------------------------------
// Editor (CodeMirror)
// --------------------------------------------------------------------------
function initEditor() {
  const textarea = document.getElementById('codeEditor');
  if (!textarea) return;

  const isLight = document.body.classList.contains('light');
  editor = CodeMirror.fromTextArea(textarea, {
    mode: 'python', theme: isLight ? 'default' : 'material-darker',
    lineNumbers: true, indentUnit: 4, tabSize: 4,
    lineWrapping: false, autofocus: true,
  });

  const f = activeFile();
  if (f) editor.setValue(f.content);
  editor.on('change', () => saveContent(editor.getValue()));
}

// --------------------------------------------------------------------------
// Terminal Resizer
// --------------------------------------------------------------------------
function initResizer() {
  const handle = document.getElementById('terminalResizer');
  const terminal = document.getElementById('terminalArea');
  const workspace = document.querySelector('.main-content');
  if (!handle || !terminal || !workspace) return;

  let dragging = false;

  handle.addEventListener('mousedown', e => {
    dragging = true; e.preventDefault();
    handle.classList.add('dragging');
    document.body.style.cursor = document.body.style.userSelect = '';
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const box = workspace.getBoundingClientRect();
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

// --------------------------------------------------------------------------
// Mobile Navigation
// --------------------------------------------------------------------------
function initMobileNav() {
  const tabEditor = document.getElementById('mobileTabEditor');
  const tabTerminal = document.getElementById('mobileTabTerminal');
  const mainContent = document.querySelector('.main-content');

  const sidebarBtn = document.getElementById('sidebarToggleBtn');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (tabEditor && tabTerminal && mainContent) {
    tabEditor.onclick = () => {
      tabEditor.classList.add('active');
      tabTerminal.classList.remove('active');
      mainContent.classList.add('mobile-show-editor');
      mainContent.classList.remove('mobile-show-terminal');
      if (editor) {
        setTimeout(() => editor.refresh(), 50);
      }
    };

    tabTerminal.onclick = () => {
      tabTerminal.classList.add('active');
      tabEditor.classList.remove('active');
      mainContent.classList.add('mobile-show-terminal');
      mainContent.classList.remove('mobile-show-editor');
    };
  }

  if (sidebarBtn && sidebar && overlay) {
    sidebarBtn.onclick = () => {
      if (window.innerWidth > 768) {
        sidebar.classList.toggle('collapsed');
        if (editor) {
          setTimeout(() => editor.refresh(), 50);
        }
      } else {
        sidebar.classList.toggle('mobile-open');
        overlay.classList.toggle('active');
      }
    };

    overlay.onclick = () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    };
  }

  // Activity Bar Explorer toggle for desktop
  const explorerTab = document.querySelector('.activity-bar .action-item');
  if (explorerTab && sidebar) {
    explorerTab.onclick = () => {
      if (window.innerWidth > 768) {
        sidebar.classList.toggle('collapsed');
        if (editor) {
          setTimeout(() => editor.refresh(), 50);
        }
      }
    };
  }
}

// --------------------------------------------------------------------------
// SUPER ADMIN DASHBOARD LOGIC
// --------------------------------------------------------------------------
function initAdminPage() {
  const adminLoginForm = document.getElementById('adminLoginForm');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  const header = document.querySelector('header');

  adminToken = localStorage.getItem('admin_token');

  if (adminToken) {
    if (header) header.style.display = 'flex';
    adminLogoutBtn.style.display = 'block';
    switchView('adminDashboardView');
    loadAdminAnalytics();
    loadAdminLeads();
    loadAdminQueue();
  } else {
    if (header) header.style.display = 'none';
    adminLogoutBtn.style.display = 'none';
    switchView('adminLoginView');
  }

  // Admin Login Form
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;

    const submitBtn = document.getElementById('adminLoginSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerText = "Entering...";

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        showToast("Welcome to Admin Console!", "success");
        localStorage.setItem('admin_token', data.token);
        adminToken = data.token;
        if (header) header.style.display = 'flex';
        adminLogoutBtn.style.display = 'block';
        switchView('adminDashboardView');
        loadAdminAnalytics();
        loadAdminLeads();
        loadAdminQueue();
      } else {
        showToast(data.error || "Authentication failed.", "error");
      }
    } catch (error) {
      console.error(error);
      showToast("Failed to reach server.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "Access Dashboard";
    }
  });

  // Admin Logout Button
  adminLogoutBtn.addEventListener('click', () => {
    localStorage.removeItem('admin_token');
    adminToken = null;
    if (header) header.style.display = 'none';
    adminLogoutBtn.style.display = 'none';
    switchView('adminLoginView');
    showToast("Admin logged out.", "info");
  });

  // Apply Filter Button Click
  document.getElementById('applyFiltersBtn').onclick = () => {
    leadsCurrentPage = 1;
    loadAdminLeads();
  };

  // Clear Filter Button Click
  document.getElementById('resetFiltersBtn').onclick = () => {
    document.getElementById('searchFilter').value = '';
    document.getElementById('qualificationFilter').value = '';
    document.getElementById('countryFilter').value = '';
    document.getElementById('sourceFilter').value = '';
    leadsCurrentPage = 1;
    loadAdminLeads();
  };

  // Leads pagination controls
  document.getElementById('prevPageBtn').onclick = () => {
    if (leadsCurrentPage > 1) {
      leadsCurrentPage--;
      loadAdminLeads();
    }
  };
  document.getElementById('nextPageBtn').onclick = () => {
    if (leadsCurrentPage < leadsTotalPages) {
      leadsCurrentPage++;
      loadAdminLeads();
    }
  };

  // Export CSV
  document.getElementById('exportCsvBtn').onclick = async () => {
    const search = document.getElementById('searchFilter').value;
    const qualification = document.getElementById('qualificationFilter').value;
    const country = document.getElementById('countryFilter').value;
    const source_id = document.getElementById('sourceFilter').value;

    const params = new URLSearchParams({ search, qualification, country, source_id });

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/leads/export?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast("CSV leads exported!", "success");
      } else {
        showToast("Failed to generate CSV export file.", "error");
      }
    } catch (err) {
      showToast("Network error during CSV export.", "error");
    }
  };
}

async function loadAdminAnalytics() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/analytics`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await response.json();

    if (response.ok) {
      const { totalSignups, otpCompletionRate, crmQueue } = data.analytics;

      document.getElementById('statTotalLeads').innerText = (totalSignups - 5);
      document.getElementById('statOtpRate').innerText = `${otpCompletionRate}%`;
      document.getElementById('statCrmSuccess').innerText = crmQueue.succeeded;
      document.getElementById('statCrmFailed').innerText = `${crmQueue.failed} / ${crmQueue.dead}`;
    }
  } catch (error) {
    console.error("Failed to load metrics:", error);
  }
}

async function loadAdminLeads() {
  const search = document.getElementById('searchFilter').value;
  const qualification = document.getElementById('qualificationFilter').value;
  const country = document.getElementById('countryFilter').value;
  const source_id = document.getElementById('sourceFilter').value;

  const params = new URLSearchParams({
    search,
    qualification,
    country,
    source_id,
    page: leadsCurrentPage,
    limit: 10
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/leads?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await response.json();

    if (response.ok) {
      const tableBody = document.getElementById('leadsTableBody');
      tableBody.innerHTML = '';

      const leads = data.leads;

      if (leads.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No matching leads found.</td></tr>`;
      } else {
        leads.forEach(lead => {
          const tr = document.createElement('tr');
          const dateStr = new Date(lead.created_at).toLocaleString();

          tr.innerHTML = `
            <td><strong>${escapeHtml(lead.name)}</strong></td>
            <td>${escapeHtml(lead.phone_e164)}</td>
            <td>${escapeHtml(lead.country)}</td>
            <td>${escapeHtml(lead.qualification)}</td>
            <td>${escapeHtml(lead.source_id || '-')}</td>
            <td>${dateStr}</td>
          `;
          tableBody.appendChild(tr);
        });
      }

      // Update pagination
      const pageInfo = data.pagination;
      leadsCurrentPage = pageInfo.page;
      leadsTotalPages = pageInfo.pages;

      document.getElementById('paginationInfo').innerText = `Showing page ${leadsCurrentPage} of ${leadsTotalPages || 1}`;
      document.getElementById('prevPageBtn').disabled = leadsCurrentPage <= 1;
      document.getElementById('nextPageBtn').disabled = leadsCurrentPage >= leadsTotalPages;
    }
  } catch (error) {
    console.error(error);
  }
}

async function loadAdminQueue() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/crm/queue`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await response.json();

    if (response.ok) {
      const tableBody = document.getElementById('crmQueueTableBody');
      tableBody.innerHTML = '';

      const queue = data.queue;

      if (queue.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No failed items currently in CRM queue.</td></tr>`;
      } else {
        queue.forEach(item => {
          const tr = document.createElement('tr');
          const nextRetry = item.next_retry_at ? new Date(item.next_retry_at).toLocaleString() : 'N/A';
          const payload = item.payload;

          tr.innerHTML = `
            <td>
              <strong>${escapeHtml(payload.name)}</strong><br>
              <span style="font-size: 11px; color: var(--text-muted)">${escapeHtml(payload.phone)}</span>
            </td>
            <td><span class="status-badge ${item.status}">${item.status}</span></td>
            <td>${item.attempts}</td>
            <td>${nextRetry}</td>
            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.last_response || '')}">
              ${escapeHtml(item.last_response || '')}
            </td>
            <td>
              <button class="btn-small" onclick="retryCrmPush('${item.user_id}')">Retry Push</button>
            </td>
          `;
          tableBody.appendChild(tr);
        });
      }
    }
  } catch (error) {
    console.error(error);
  }
}

async function retryCrmPush(userId) {
  showToast("Triggering manual CRM push...", "info");

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/crm/retry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ userId })
    });

    const data = await response.json();

    if (response.ok) {
      showToast("CRM push retry successful!", "success");
    } else {
      showToast(data.error || "Push failed again.", "error");
    }

    // Refresh admin tables/metrics
    loadAdminAnalytics();
    loadAdminQueue();
  } catch (error) {
    showToast("Error processing request.", "error");
  }
}

// --------------------------------------------------------------------------
// HTML Escaper Helper
// --------------------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
