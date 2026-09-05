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

async function doServerAction(id, action) {
  const response = await fetch(`/api/servers/${id}/action?type=${action}`, {
    method: 'POST',
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Failed to ${action} server`);
  }
}

// The name the delete confirmation must match. Kept in sync with the saved
// server, not the Name field, which the user may have edited without saving.
let currentServerName = '';

function setDeleteTarget(name) {
  currentServerName = name;
  setText('delete-server-name', name);
  syncDeleteButton();
}

function syncDeleteButton() {
  const button = document.getElementById('delete-server');
  const input = document.getElementById('delete-confirm-name');
  if (!button || !input) return;
  button.disabled = currentServerName === '' || input.value.trim() !== currentServerName;
}

function attachDeleteAction(id) {
  const button = document.getElementById('delete-server');
  const input = document.getElementById('delete-confirm-name');
  const status = document.getElementById('delete-status');
  if (!button || !input || !status) return;

  input.addEventListener('input', syncDeleteButton);
  syncDeleteButton();

  button.onclick = async () => {
    if (!confirm(`Delete "${currentServerName}" and all of its data?`)) {
      return;
    }
    status.className = 'text-muted';
    status.textContent = 'Deleting...';
    button.disabled = true;
    try {
      const response = await fetch(`/api/servers/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to delete server');
      }
      window.location.href = '/';
    } catch (err) {
      status.className = 'text-danger';
      status.textContent = err.message;
      syncDeleteButton();
    }
  };
}

// Only one of Start/Stop applies at a time; "starting" and "unknown" leave both
// available so a stuck server can be nudged either way.
function renderStatus(status) {
  setText('server-status', status);
  const startButton = document.getElementById('start-server');
  const stopButton = document.getElementById('stop-server');
  if (startButton) startButton.disabled = status === 'running';
  if (stopButton) stopButton.disabled = status === 'stopped';
}

function attachServerActions(id) {
  const startButton = document.getElementById('start-server');
  const stopButton = document.getElementById('stop-server');
  const status = document.getElementById('server-action-status');
  if (!startButton || !stopButton || !status) return;

  [['start', startButton], ['stop', stopButton]].forEach(([action, button]) => {
    button.onclick = async () => {
      status.className = 'text-muted';
      status.textContent = action === 'start' ? 'Starting...' : 'Stopping...';
      startButton.disabled = true;
      stopButton.disabled = true;
      try {
        await doServerAction(id, action);
        status.className = 'text-success';
        status.textContent = action === 'start' ? 'Server started.' : 'Server stopped.';
      } catch (err) {
        status.className = 'text-danger';
        status.textContent = err.message;
      }
      // Re-read the real status either way: it also re-enables the buttons.
      try {
        const current = await fetchServer(id);
        renderStatus(current.status);
      } catch (refreshError) {
        startButton.disabled = false;
        stopButton.disabled = false;
      }
    };
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
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
    renderStatus(server.status);
    attachServerActions(id);
    setDeleteTarget(server.name);
    setText('server-created', formatDate(server.createdAt));
    setValue('server-name', server.name);
    setValue('server-port', server.port);
    // Servers created before the version field existed have no value recorded;
    // saving the form will write one.
    setValue('server-version', server.version || '');

    const editForm = document.getElementById('edit-server-form');
    if (editForm) {
      editForm.onsubmit = async event => {
        event.preventDefault();
        const status = document.getElementById('server-save-status');
        const saveButton = document.getElementById('save-server');
        const body = {
          name: document.getElementById('server-name').value.trim(),
          port: Number(document.getElementById('server-port').value),
          version: document.getElementById('server-version').value.trim(),
        };
        status.className = 'text-muted';
        status.textContent = 'Saving...';
        saveButton.disabled = true;
        try {
          const response = await fetch(`/api/servers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to save server');
          }
          const updated = await response.json();
          renderStatus(updated.status);
          setDeleteTarget(updated.name);
          setValue('server-name', updated.name);
          setValue('server-port', updated.port);
          setValue('server-version', updated.version);
          status.className = 'text-warning';
          status.textContent = 'Saved. Restart the server to apply the changes.';
        } catch (err) {
          status.className = 'text-danger';
          status.textContent = err.message;
        } finally {
          saveButton.disabled = false;
        }
      };
    }

    attachDeleteAction(id);

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
