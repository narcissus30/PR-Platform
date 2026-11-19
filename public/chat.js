(() => {
  const panel = document.getElementById('guideChat');
  const launch = document.getElementById('chatLaunch');
  const navLaunch = document.getElementById('chatNavLaunch');
  let returnFocus = launch;
  const input = document.getElementById('chatInput');
  const log = document.getElementById('chatMessages');
  const form = document.getElementById('chatForm');
  const status = document.getElementById('chatStatus');
  const clear = document.getElementById('chatClear');
  let history = [];
  let busy = false;
  function toggle(open) {
    panel.hidden = !open;
    launch.hidden = open;
    launch.setAttribute('aria-expanded', String(open));
    navLaunch.setAttribute('aria-expanded', String(open));
    (open ? input : returnFocus).focus();
  }
  [launch, navLaunch].forEach(button => button.addEventListener('click', () => {
    returnFocus = button;
    toggle(true);
  }));
  document.getElementById('chatClose').addEventListener('click', () => toggle(false));
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
  function message(text, role) {
    const node = document.createElement('div');
    node.className = `chat-message ${role}`;
    node.textContent = text;
    log.append(node);
    log.scrollTop = log.scrollHeight;
    return node;
  }
  clear.addEventListener('click', () => {
    if (busy) return;
    history = [];
    log.replaceChildren();
    message('A fresh start. What would you like to learn from the guide?', 'assistant');
    input.focus();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  document.querySelectorAll('.chat-prompts button').forEach(button => button.addEventListener('click', () => {
    if (busy) return;
    input.value = button.textContent;
    form.requestSubmit();
  }));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const query = input.value.trim();
    if (busy || !query) return;
    busy = true;
    document.getElementById('chatSend').disabled = true;
    clear.disabled = true;
    message(query, 'user');
    input.value = '';
    const reply = message('Reading the guide…', 'assistant');
    status.textContent = 'Finding an answer across the guide…';
    let answer = '';
    let done = false;
    const messages = [...history.slice(-10), { role: 'user', content: query }];
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 100000);
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }), signal: abort.signal });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'The guide assistant is unavailable. Please try again shortly.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.error) throw new Error(event.error);
          if (event.delta) { answer += event.delta; reply.textContent = answer; }
          if (event.done) {
            done = true;
            for (const source of event.sources || []) {
              const button = document.createElement('button');
              button.className = 'chat-source';
              button.textContent = `Read: ${source.title}`;
              button.addEventListener('click', () => {
                window.selectModule(source.moduleId);
                toggle(false);
                const target = document.getElementById(source.id);
                if (target) { target.open = true; target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
              });
              reply.append(button);
            }
          }
        }
        log.scrollTop = log.scrollHeight;
        if (chunk.done) break;
      }
      if (!done) throw new Error('The answer was interrupted. Please try your question again.');
      history = [...messages, { role: 'assistant', content: answer }];
      status.textContent = 'Answer based on the guide · Check linked sources';
    } catch (error) {
      reply.textContent = error.name === 'AbortError' ? 'The answer took too long. Please try again.' : error.message;
      reply.classList.add('error');
      input.value = query;
      status.textContent = 'Your question is ready to retry';
    } finally {
      clearTimeout(timer);
      busy = false;
      document.getElementById('chatSend').disabled = false;
      clear.disabled = false;
      if (!panel.hidden) input.focus();
    }
  });
})();
