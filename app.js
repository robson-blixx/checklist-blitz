(() => {
  'use strict';
  const KEY = 'checklist-blitz-v2';
  const $ = id => document.getElementById(id);
  const operations = { Jet: 20, Total: 15 };
  const typologies = ['3/4', 'Toco', 'Truck', 'Cavalo/Carreta', 'Fiorino', 'Van', 'VUC'];
  let filter = 'all';
  let alertDays = Number(localStorage.getItem('checklist-blitz-alert-days') ?? 5);
  let apiUrl = localStorage.getItem('checklist-blitz-api-url') || '';
  let apiToken = sessionStorage.getItem('checklist-blitz-api-token') || '';
  let connected = false;

  function parseDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const value = new Date(Date.UTC(y, m - 1, d));
    return value.toISOString().slice(0, 10) === iso ? value : null;
  }
  function addDays(iso, days) {
    const value = parseDate(iso);
    if (!value) return '';
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }
  function today() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  }
  function dueDate(record) { return addDays(record.issuedAt, operations[record.operation]); }
  function status(record) {
    const due = dueDate(record), now = today();
    if (!due) return 'Pendente';
    if (now > due) return now === addDays(due, 1) ? 'Vencido' : 'Atrasado';
    if (now === due) return 'Vence hoje';
    if (now >= addDays(due, -alertDays)) return 'Solicitado';
    return 'Em dia';
  }
  function formatted(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }
  function digits(value) { return String(value || '').replace(/\D/g, ''); }
  function loadLocal() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(value) ? value.filter(r => r && operations[r.operation] && parseDate(r.issuedAt)) : [];
    } catch (_) { return []; }
  }
  let records = loadLocal();
  function message(text, error = false) {
    $('connectionState').textContent = text;
    $('connectionState').className = error ? 'hint error' : 'hint success';
  }
  async function api(path, options = {}) {
    const response = await fetch(apiUrl + path, {
      ...options,
      headers: { Authorization: 'Bearer ' + apiToken, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Falha ao acessar o serviço');
    return result;
  }
  async function persist(next) {
    if (connected) await api('/records', { method: 'PUT', body: JSON.stringify(next) });
    records = next;
    localStorage.setItem(KEY, JSON.stringify(records));
    render();
  }
  function updateDue() { $('dueAt').value = operations[$('operation').value] ? addDays($('issuedAt').value, operations[$('operation').value]) : ''; }
  function cell(row, value) { const td = document.createElement('td'); td.textContent = value; row.append(td); return td; }
  function render() {
    const body = $('rows'); body.replaceChildren();
    const visible = records.filter(r => filter === 'all' || r.operation === filter).sort((a, b) => dueDate(a).localeCompare(dueDate(b)));
    $('empty').hidden = visible.length > 0;
    for (const record of visible) {
      const row = document.createElement('tr');
      cell(row, record.driverName);
      const opCell = cell(row, ''); const op = document.createElement('span'); op.className = 'badge ' + record.operation.toLowerCase(); op.textContent = record.operation; opCell.append(op);
      cell(row, record.plate); cell(row, record.typology); cell(row, formatted(record.issuedAt)); cell(row, formatted(dueDate(record)));
      const current = status(record), statusCell = cell(row, ''); const badge = document.createElement('span');
      badge.className = 'badge ' + (current === 'Em dia' ? 'ok' : ['Solicitado', 'Vence hoje'].includes(current) ? 'warn' : current === 'Pendente' ? 'neutral' : 'bad');
      badge.textContent = current; statusCell.append(badge);
      cell(row, record.driverPhone || '—');
      const actions = cell(row, ''); actions.className = 'actions';
      for (const [label, action, style] of [['Editar', 'edit', 'secondary'], ['Excluir', 'delete', 'danger']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'small ' + style;
        button.textContent = label; button.dataset.action = action; button.dataset.id = record.id; actions.append(button);
      }
      body.append(row);
    }
    $('totalCount').textContent = records.length;
    $('okCount').textContent = records.filter(r => status(r) === 'Em dia').length;
    $('warningCount').textContent = records.filter(r => ['Solicitado', 'Vence hoje'].includes(status(r))).length;
    $('expiredCount').textContent = records.filter(r => ['Vencido', 'Atrasado'].includes(status(r))).length;
  }
  function openForm(record) {
    $('form').reset(); $('formMessage').textContent = ''; $('recordId').value = record?.id || '';
    for (const key of ['operation', 'driverName', 'driverPhone', 'plate', 'issuedAt', 'typology', 'tracker']) if (record) $(key).value = record[key] || '';
    updateDue(); $('form').classList.add('open'); $('driverName').focus();
  }
  async function connect() {
    const url = $('apiUrl').value.trim().replace(/\/+$/, '');
    const token = $('apiToken').value.trim();
    if (!/^https:\/\//.test(url) || !token) { message('Informe o endereço HTTPS do serviço e a chave de acesso.', true); return; }
    apiUrl = url; apiToken = token;
    try {
      const [remote, settings] = await Promise.all([api('/records'), api('/settings')]);
      connected = true;
      alertDays = settings.alertDays;
      $('alertDays').value = alertDays;
      localStorage.setItem('checklist-blitz-alert-days', String(alertDays));
      localStorage.setItem('checklist-blitz-api-url', url);
      sessionStorage.setItem('checklist-blitz-api-token', token);
      $('importBtn').hidden = !(records.length && remote.length === 0);
      records = remote;
      render();
      message(remote.length ? 'Conectado. Cadastros compartilhados carregados.' : 'Conectado. O serviço ainda não tem cadastros.');
    } catch (error) { connected = false; message('Não foi possível conectar: ' + error.message, true); }
  }

  $('apiUrl').value = apiUrl; $('apiToken').value = apiToken; $('alertDays').value = alertDays;
  $('connectBtn').onclick = connect;
  $('saveAlertDays').onclick = async () => {
    const days = Number($('alertDays').value);
    if (!Number.isInteger(days) || days < 0 || days > 20) return message('Escolha de 0 a 20 dias.', true);
    try {
      if (connected) await api('/settings', { method: 'PUT', body: JSON.stringify({ alertDays: days }) });
      alertDays = days;
      localStorage.setItem('checklist-blitz-alert-days', String(days));
      render(); message(connected ? 'Prazo salvo para todos os cadastros.' : 'Prazo salvo neste navegador. Conecte o serviço para usar nos disparos.');
    } catch (error) { message('Não foi possível salvar o prazo: ' + error.message, true); }
  };
  $('importBtn').onclick = async () => {
    const local = loadLocal();
    if (!connected || !local.length || !confirm('Enviar ' + local.length + ' cadastro(s) locais para o serviço compartilhado?')) return;
    try { await persist(local); $('importBtn').hidden = true; message('Cadastros enviados ao serviço.'); }
    catch (error) { message('Falha ao enviar: ' + error.message, true); }
  };
  $('newBtn').onclick = () => openForm();
  $('cancelBtn').onclick = () => $('form').classList.remove('open');
  $('operation').onchange = updateDue; $('issuedAt').onchange = updateDue;
  $('form').onsubmit = async event => {
    event.preventDefault();
    const record = { id: $('recordId').value || crypto.randomUUID() };
    for (const key of ['operation', 'driverName', 'driverPhone', 'plate', 'issuedAt', 'typology', 'tracker']) record[key] = $(key).value.trim();
    record.plate = record.plate.toUpperCase(); record.driverPhone = digits(record.driverPhone);
    if (!operations[record.operation] || !record.driverName || !record.plate || !parseDate(record.issuedAt) || !typologies.includes(record.typology)) {
      $('formMessage').textContent = 'Preencha operação, motorista, placa, emissão e tipologia.'; $('formMessage').className = 'error'; return;
    }
    if (record.driverPhone && record.driverPhone.length < 10) {
      $('formMessage').textContent = 'Informe WhatsApp com DDD ou deixe o campo vazio.'; $('formMessage').className = 'error'; return;
    }
    const next = [...records], index = next.findIndex(r => r.id === record.id);
    if (index >= 0) next[index] = record; else next.push(record);
    try { await persist(next); $('form').classList.remove('open'); }
    catch (error) { $('formMessage').textContent = 'Não foi possível salvar: ' + error.message; $('formMessage').className = 'error'; }
  };
  $('rows').onclick = async event => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const record = records.find(r => r.id === button.dataset.id); if (!record) return;
    if (button.dataset.action === 'edit') return openForm(record);
    if (button.dataset.action === 'delete' && confirm('Excluir o cadastro de ' + record.driverName + ' na ' + record.operation + '?')) {
      try { await persist(records.filter(r => r.id !== record.id)); }
      catch (error) { message('Não foi possível excluir: ' + error.message, true); }
    }
  };
  document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
    render();
  });
  render();
  if (apiUrl && apiToken) connect();
  setInterval(() => { if (connected) api('/records').then(remote => { records = remote; render(); }).catch(() => message('Conexão perdida. Verifique o serviço.', true)); else render(); }, 60000);
})();
