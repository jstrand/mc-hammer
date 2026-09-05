const apiUrl = '/api/servers';

let createServerModal;

const NAME_ADJECTIVES = [
  'Blocky', 'Craggy', 'Cubic', 'Diamond', 'Emerald', 'Endless', 'Golden',
  'Hollow', 'Lava', 'Mossy', 'Netherite', 'Obsidian', 'Pixel', 'Redstone',
  'Rugged', 'Shady', 'Sunken', 'Twilight', 'Verdant', 'Windswept',
];

const NAME_NOUNS = [
  'Bastion', 'Bedrock', 'Caverns', 'Citadel', 'Cliffs', 'Cove', 'Depths',
  'Fortress', 'Grotto', 'Highlands', 'Keep', 'Mesa', 'Mineshaft', 'Outpost',
  'Ravine', 'Realm', 'Spawn', 'Stronghold', 'Summit', 'Valley', 'Wilds',
];

// Names of the servers from the last list load, so suggestions don't collide.
let knownServerNames = [];

// The suggestion currently sitting in the name field. Used to tell an untouched
// suggestion (safe to replace) from a name the user typed (never replace).
let lastSuggestedName = '';

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function suggestServerName() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${pick(NAME_ADJECTIVES)} ${pick(NAME_NOUNS)}`;
    if (!knownServerNames.includes(candidate)) {
      return candidate;
    }
  }
  // Every roll collided, so fall back to numbering one of them.
  const base = `${pick(NAME_ADJECTIVES)} ${pick(NAME_NOUNS)}`;
  let suffix = 2;
  while (knownServerNames.includes(`${base} ${suffix}`)) {
    suffix += 1;
  }
  return `${base} ${suffix}`;
}

function fillSuggestedName(force) {
  const input = document.querySelector('#server-name');
  if (!input) return;
  const current = input.value.trim();
  if (!force && current !== '' && current !== lastSuggestedName) {
    return;
  }
  lastSuggestedName = suggestServerName();
  input.value = lastSuggestedName;
}

async function fetchServers() {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error('Failed to load servers');
  }
  return response.json();
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

function renderServers(servers) {
  const tbody = document.querySelector('#servers-table tbody');
  tbody.innerHTML = '';
  
  if (!servers || servers.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td colspan="5" class="text-center text-muted py-4">
        No servers yet. Click <strong>Create Server</strong> to get started!
      </td>
    `;
    tbody.appendChild(row);
    return;
  }
  
  servers.forEach(server => {
    const row = document.createElement('tr');
    const isRunning = server.status === 'running';
    row.innerHTML = `
      <td>${server.name}</td>
      <td>${server.port}</td>
      <td>${server.status}</td>
      <td>${formatDate(server.createdAt)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-${isRunning ? 'warning' : 'success'} me-2" data-action="${isRunning ? 'stop' : 'start'}" data-server-id="${server.id}">
          ${isRunning ? 'Stop' : 'Start'}
        </button>
        <a class="btn btn-sm btn-outline-primary" href="/server?id=${server.id}">View</a>
      </td>
    `;
    tbody.appendChild(row);
  });
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

async function loadServers() {
  try {
    const servers = await fetchServers();
    knownServerNames = (servers || []).map(server => server.name);
    renderServers(servers);
    attachServerActions();
  } catch (error) {
    document.querySelector('#servers-table tbody').innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
  }
}

function attachServerActions() {
  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', async event => {
      const action = button.getAttribute('data-action');
      const id = button.getAttribute('data-server-id');
      if (!action || !id) {
        return;
      }
      button.disabled = true;
      try {
        await doServerAction(id, action);
        showPageAlert(`Server ${action === 'start' ? 'started' : 'stopped'} successfully.`, 'success');
        loadServers();
      } catch (error) {
        showPageAlert(`Error ${action}ing server: ${error.message}`, 'danger');
      } finally {
        button.disabled = false;
      }
    });
  });
}

function showPageAlert(message, type) {
  const pageAlert = document.querySelector('#page-alert');
  pageAlert.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>`;
}

function clearPageAlert() {
  const pageAlert = document.querySelector('#page-alert');
  pageAlert.innerHTML = '';
}

function clearCreateAlert() {
  const feedback = document.querySelector('#create-feedback');
  if (feedback) {
    feedback.innerHTML = '';
  }
}

function showCreateAlert(message, type) {
  const feedback = document.querySelector('#create-feedback');
  if (!feedback) return;
  feedback.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>`;
}

async function handleCreate(event) {
  event.preventDefault();
  const name = document.querySelector('#server-name').value.trim();
  const port = Number(document.querySelector('#server-port').value);
  const version = document.querySelector('#server-version').value.trim();
  const formContent = document.querySelector('#create-form-content');
  const loading = document.querySelector('#create-loading');
  const submitBtn = document.querySelector('#create-submit-btn');
  const cancelBtns = document.querySelectorAll('[data-bs-dismiss="modal"]');

  clearCreateAlert();

  // Show loading state
  formContent.style.display = 'none';
  loading.style.display = 'block';
  submitBtn.disabled = true;
  cancelBtns.forEach(btn => btn.disabled = true);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, port, version }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Unable to create server');
    }

    const createdServer = await response.json();
    showPageAlert(`Server "${createdServer.name}" created successfully on port ${createdServer.port}.`, 'success');
    document.querySelector('#create-form').reset();
    createServerModal.hide();
    loadServers();
  } catch (error) {
    showCreateAlert(`Error creating server: ${error.message}`, 'danger');
  } finally {
    formContent.style.display = 'block';
    loading.style.display = 'none';
    submitBtn.disabled = false;
    cancelBtns.forEach(btn => btn.disabled = false);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const modalElement = document.getElementById('createServerModal');
  createServerModal = new bootstrap.Modal(modalElement);
  loadServers();
  document.querySelector('#create-form').addEventListener('submit', handleCreate);
  modalElement.addEventListener('show.bs.modal', () => fillSuggestedName(false));
  document.querySelector('#suggest-name').addEventListener('click', () => fillSuggestedName(true));
});
