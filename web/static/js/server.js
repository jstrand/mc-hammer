function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function fetchServer(id) {
  const response = await fetch(`/api/servers/${id}`);
  if (!response.ok) {
    throw new Error('Failed to load server details');
  }
  return response.json();
}

async function fetchServerLogs(id) {
  const response = await fetch(`/api/servers/${id}/logs`);
  if (!response.ok) {
    throw new Error('Failed to load logs');
  }
  return response.text();
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatDate(value) {
  const d = new Date(value);
  const pad = num => String(num).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function updateLogs(logsText) {
  const logsOutput = document.getElementById('logs-output');
  if (!logsOutput) return;
  
  logsOutput.textContent = logsText;
  logsOutput.style.whiteSpace = 'pre-wrap';
  logsOutput.style.wordBreak = 'break-word';
  logsOutput.scrollTop = logsOutput.scrollHeight;
}

let logsInterval = null;

async function refreshLogs(id) {
  try {
    const logsText = await fetchServerLogs(id);
    updateLogs(logsText || '(no logs yet)');
  } catch (error) {
    const logsOutput = document.getElementById('logs-output');
    if (logsOutput) {
      logsOutput.textContent = 'Error loading logs: ' + error.message;
      logsOutput.classList.add('text-danger');
    }
  }
}

function startLogsPolling(id) {
  if (logsInterval) {
    clearInterval(logsInterval);
  }
  refreshLogs(id);
  logsInterval = setInterval(function() {
    refreshLogs(id);
  }, 2000);
}

function stopLogsPolling() {
  if (logsInterval) {
    clearInterval(logsInterval);
    logsInterval = null;
  }
}

async function loadServerDetails() {
  const id = getQueryParam('id');
  const feedback = document.getElementById('server-feedback');
  if (!id) {
    feedback.textContent = 'Server id is missing from URL.';
    return;
  }
  try {
    const server = await fetchServer(id);
    setText('server-id', server.id);
    setText('server-name', server.name);
    setText('server-port', server.port);
    setText('server-status', server.status);
    setText('server-created', formatDate(server.createdAt));
    document.getElementById('delete-server').onclick = async () => {
      if (!confirm('Delete this server and all data?')) {
        return;
      }
      const response = await fetch(`/api/servers/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorText = await response.text();
        feedback.textContent = errorText || 'Failed to delete server';
        feedback.classList.add('text-danger');
        return;
      }
      window.location.href = '/';
    };

    const saveButton = document.getElementById('save-properties');
    if (saveButton) {
      saveButton.onclick = async () => {
        const editor = document.getElementById('properties-editor');
        const status = document.getElementById('properties-status');
        if (!editor || !status) return;
        status.textContent = 'Saving...';
        try {
          const response = await fetch(`/api/servers/${id}/properties`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: editor.value }),
          });
          if (!response.ok) {
            const errorText = await response.text();
            status.textContent = errorText || 'Failed to save configuration';
            status.classList.add('text-danger');
            return;
          }
          status.textContent = 'Configuration saved.';
          status.classList.remove('text-danger');
          status.classList.add('text-success');
        } catch (err) {
          status.textContent = 'Save failed: ' + err.message;
          status.classList.add('text-danger');
        }
      };
    }

    const logsTab = document.getElementById('logs-tab');
    if (logsTab) {
      logsTab.addEventListener('shown.bs.tab', function() {
        startLogsPolling(id);
      });
      logsTab.addEventListener('hidden.bs.tab', function() {
        stopLogsPolling();
      });
    }

    const commandsTab = document.getElementById('commands-tab');
    if (commandsTab) {
      commandsTab.addEventListener('shown.bs.tab', function() {
        const output = document.getElementById('command-output');
        if (output) {
          output.textContent = 'Enter a command and click Run.';
        }
      });
    }

    const runCommandButton = document.getElementById('run-command');
    const commandInput = document.getElementById('command-input');
    if (runCommandButton) {
      runCommandButton.onclick = async () => {
        const status = document.getElementById('command-status');
        const output = document.getElementById('command-output');
        if (!commandInput || !status || !output) return;
        const command = commandInput.value.trim();
        if (command === '') {
          status.textContent = 'Enter a command to run.';
          status.classList.add('text-danger');
          return;
        }
        status.textContent = 'Running...';
        status.classList.remove('text-danger');
        try {
          const response = await fetch(`/api/servers/${id}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command }),
          });
          const text = await response.text();
          if (!response.ok) {
            status.textContent = 'Command failed';
            status.classList.add('text-danger');
            output.textContent = text || 'Failed to execute command';
            return;
          }
          status.textContent = 'Command executed';
          status.classList.remove('text-danger');
          output.textContent = text || '(no output)';
        } catch (err) {
          status.textContent = 'Request failed';
          status.classList.add('text-danger');
          output.textContent = err.message;
        }
      };
    }
    if (commandInput) {
      commandInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (runCommandButton) {
            runCommandButton.click();
          }
        }
      });
    }

    const configTab = document.getElementById('config-tab');
    if (configTab) {
      configTab.addEventListener('shown.bs.tab', async function() {
        await loadServerProperties(id);
      });
    }
  } catch (error) {
    feedback.textContent = error.message;
    feedback.classList.add('text-danger');
  }
}

async function loadServerProperties(id) {
  const editor = document.getElementById('properties-editor');
  const status = document.getElementById('properties-status');
  if (!editor || !status) return;
  status.textContent = 'Loading configuration...';
  try {
    const response = await fetch(`/api/servers/${id}/properties`);
    if (!response.ok) {
      const errorText = await response.text();
      status.textContent = errorText || 'Failed to load configuration';
      status.classList.add('text-danger');
      return;
    }
    const data = await response.json();
    editor.value = data.content || '';
    status.textContent = 'Configuration loaded.';
    status.classList.remove('text-danger');
  } catch (err) {
    status.textContent = 'Load failed: ' + err.message;
    status.classList.add('text-danger');
  }
}

window.addEventListener('DOMContentLoaded', loadServerDetails);
