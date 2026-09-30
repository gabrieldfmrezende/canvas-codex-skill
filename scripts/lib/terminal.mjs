import { createInterface, emitKeypressEvents } from 'node:readline';
import { CanvasError } from './core.mjs';

export function cleanDisplay(value) {
  return String(value ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

export function question(prompt, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY || !output.isTTY) return Promise.reject(new CanvasError('usage', 'terminal'));
  return new Promise((resolve, reject) => {
    const reader = createInterface({ input, output });
    let settled = false;
    reader.on('SIGINT', () => { settled = true; reader.close(); reject(new CanvasError('cancelled')); });
    reader.on('close', () => { if (!settled) reject(new CanvasError('cancelled')); });
    reader.question(prompt, answer => { settled = true; reader.close(); resolve(answer); });
  });
}

export function hiddenQuestion(prompt, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY || !output.isTTY) return Promise.reject(new CanvasError('usage', 'terminal'));
  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = Boolean(input.isRaw);
    const wasPaused = input.isPaused();
    emitKeypressEvents(input);
    function finish(error) {
      input.off('keypress', onKey);
      input.off('end', onEnd);
      input.setRawMode(wasRaw);
      if (wasPaused) input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
      value = '';
    }
    function onEnd() { finish(new CanvasError('cancelled')); }
    function onKey(text, key = {}) {
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) return finish(new CanvasError('cancelled'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') value = [...value].slice(0, -1).join('');
      else if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    }
    output.write(`${prompt}: `);
    input.on('keypress', onKey);
    input.once('end', onEnd);
    input.setRawMode(true);
    input.resume();
  });
}

export function removalCommands(platform = process.platform) {
  if (platform === 'win32') return `[Environment]::SetEnvironmentVariable('CANVAS_BASE_URL', $null, 'User')
[Environment]::SetEnvironmentVariable('CANVAS_API_TOKEN', $null, 'User')
Remove-Item Env:CANVAS_BASE_URL, Env:CANVAS_API_TOKEN -ErrorAction SilentlyContinue`;
  return 'unset CANVAS_BASE_URL CANVAS_API_TOKEN\n# Remove old exports from your shell configuration as well.';
}
