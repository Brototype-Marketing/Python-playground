// Web Worker — Pyodide Python runtime with stdin queue
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js");

let pyodide = null;

async function initPyodide() {
  if (pyodide) return;

  self.postMessage({ type: 'status', message: 'Downloading Python (~15 MB)…' });

  pyodide = await loadPyodide({
    stdout: text => self.postMessage({ type: 'stdout', content: text }),
    stderr: text => self.postMessage({ type: 'stderr', content: text }),
  });

  self.postMessage({ type: 'ready' });
}

self.onmessage = async ({ data }) => {
  const { type } = data;

  if (type === 'init') {
    try { await initPyodide(); }
    catch (e) { self.postMessage({ type: 'error', content: 'Failed to load Pyodide: ' + e.message }); }

  } else if (type === 'run') {
    try {
      if (!pyodide) await initPyodide();

      self.postMessage({ type: 'start' });

      // Expose a JS helper to Python for synchronous blocking input
      self._js_input = (prompt) => {
        self.postMessage({ type: 'input_request', prompt: String(prompt || '') });

        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'get-stdin?ts=' + Date.now(), false);
        xhr.send(null);
        return xhr.responseText;
      };

      // Override builtins.input
      pyodide.runPython(`
import builtins as _b
import js

def _patched_input(prompt=''):
    return str(js._js_input(prompt))

_b.input = _patched_input
`);

      await pyodide.runPythonAsync(data.code);
      self.postMessage({ type: 'success' });

    } catch (e) {
      self.postMessage({ type: 'error', content: e.message });
    }
  }
};
