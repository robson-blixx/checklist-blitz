(() => {
  'use strict';
  const KEY = 'checklist-blitz-v2';
  const $ = id => document.getElementById(id);
  const operations = { Jet: 20, Total: 15 };
  const typologies = ['3/4', 'Toco', 'Truck', 'Cavalo/Carreta', 'Fiorino', 'Van', 'VUC'];
  let filter = 'all';
  let alertDays = Number(localStorage.getItem('checklist-blitz-alert-days') ?? 5);
  let soundEnabled = localStorage.getItem('checklist-blitz-sound') === 'yes';

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
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  function dueDate(record) { return addDays(record.issuedAt, operations[record.operation]); }
  function status(record) {
    const due = dueDate(record), now = today();
    if (!due) return 'Pendente';
    if (now > due) return 'Vencido';
    if (now === due) return 'Vence hoje';
    if (now >= addDays(due, -alertDays)) return record.alertSent ? 'Solicitado' : 'Aviso pendente';
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
    $('settingsMessage').textContent = text;
    $('settingsMessage').className = error ? 'hint error' : 'hint success';
  }
  async function playAlert() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    const context = new Context();
    try {
      await context.resume();
      if (context.state !== 'running') return false;
      for (const [index, frequency] of [784, 1046].entries()) {
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.3);
        gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + index * 0.3 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.3 + 0.25);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(context.currentTime + index * 0.3);
        oscillator.stop(context.currentTime + index * 0.3 + 0.26);
      }
      setTimeout(() => context.close(), 1000);
      return true;
    } catch (_) { await context.close(); return false; }
  }
  async function notifyDue(force = false) {
    if (!soundEnabled) return;
    const pending = records.filter(r => ['Aviso pendente', 'Vence hoje', 'Vencido'].includes(status(r)));
    if (!pending.length) return;
    const key = today() + ':' + pending.map(r => r.id + ':' + status(r)).sort().join(',');
    if (!force && localStorage.getItem('checklist-blitz-last-sound') === key) return;
    if (await playAlert()) {
      localStorage.setItem('checklist-blitz-last-sound', key);
      message(`${pending.length} checklist(s) precisam de atenção. Aviso sonoro ativo.`);
    } else message('Clique em “Ativar som dos avisos” para liberar o áudio neste navegador.', true);
  }
  function persist(next) {
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
      badge.className = 'badge ' + (current === 'Em dia' ? 'ok' : ['Solicitado', 'Aviso pendente', 'Vence hoje'].includes(current) ? 'warn' : current === 'Pendente' ? 'neutral' : 'bad');
      badge.textContent = current; statusCell.append(badge);
      cell(row, record.driverPhone || '—');
      const actions = cell(row, ''); actions.className = 'actions';
      for (const [label, action, style] of [['Editar', 'edit', 'secondary'], ['Excluir', 'delete', 'danger']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'small ' + style;
        button.textContent = label; button.dataset.action = action; button.dataset.id = record.id; actions.append(button);
      }
      if (current === 'Aviso pendente') {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'small secondary';
        button.textContent = 'Marcar solicitado'; button.dataset.action = 'requested'; button.dataset.id = record.id; actions.prepend(button);
      }
      body.append(row);
    }
    $('totalCount').textContent = records.length;
    $('okCount').textContent = records.filter(r => status(r) === 'Em dia').length;
    $('warningCount').textContent = records.filter(r => ['Solicitado', 'Aviso pendente', 'Vence hoje'].includes(status(r))).length;
    $('expiredCount').textContent = records.filter(r => status(r) === 'Vencido').length;
    void notifyDue();
  }
  function openForm(record) {
    $('form').reset(); $('formMessage').textContent = ''; $('recordId').value = record?.id || '';
    for (const key of ['operation', 'driverName', 'driverPhone', 'plate', 'issuedAt', 'typology', 'tracker']) if (record) $(key).value = record[key] || '';
    updateDue(); $('form').classList.add('open'); $('driverName').focus();
  }
  $('alertDays').value = alertDays;
  $('soundBtn').textContent = soundEnabled ? 'Som ativado' : 'Ativar som dos avisos';
  $('soundBtn').onclick = async () => {
    soundEnabled = true;
    localStorage.setItem('checklist-blitz-sound', 'yes');
    $('soundBtn').textContent = 'Som ativado';
    if (records.some(r => ['Aviso pendente', 'Vence hoje', 'Vencido'].includes(status(r)))) await notifyDue(true);
    else if (await playAlert()) message('Som ativado. Você ouvirá este sinal quando houver checklist em aviso ou vencido.');
    else message('O navegador bloqueou o áudio. Verifique a permissão de som desta página.', true);
  };
  $('saveAlertDays').onclick = () => {
    const days = Number($('alertDays').value);
    if (!Number.isInteger(days) || days < 0 || days > 20) return message('Escolha de 0 a 20 dias.', true);
    alertDays = days;
    localStorage.setItem('checklist-blitz-alert-days', String(days));
    render(); message('Prazo de aviso salvo neste navegador.');
  };
  $('newBtn').onclick = () => openForm();
  $('cancelBtn').onclick = () => $('form').classList.remove('open');
  $('operation').onchange = updateDue; $('issuedAt').onchange = updateDue;
  $('form').onsubmit = event => {
    event.preventDefault();
    const record = { id: $('recordId').value || crypto.randomUUID() };
    for (const key of ['operation', 'driverName', 'driverPhone', 'plate', 'issuedAt', 'typology', 'tracker']) record[key] = $(key).value.trim();
    record.plate = record.plate.toUpperCase(); record.driverPhone = digits(record.driverPhone);
    if (!operations[record.operation] || !record.driverName || !record.plate || !parseDate(record.issuedAt) || !typologies.includes(record.typology)) {
      $('formMessage').textContent = 'Preencha operação, motorista, placa, emissão e tipologia.'; $('formMessage').className = 'error'; return;
    }
    if (![10, 11, 12, 13].includes(record.driverPhone.length)) {
      $('formMessage').textContent = 'Informe o WhatsApp do motorista com DDD.'; $('formMessage').className = 'error'; return;
    }
    const next = [...records], index = next.findIndex(r => r.id === record.id);
    if (index >= 0) record.alertSent = next[index].issuedAt === record.issuedAt && next[index].operation === record.operation && !!next[index].alertSent;
    if (index >= 0) next[index] = record; else next.push(record);
    try { persist(next); $('form').classList.remove('open'); }
    catch (error) { $('formMessage').textContent = 'Não foi possível salvar: ' + error.message; $('formMessage').className = 'error'; }
  };
  $('rows').onclick = event => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const record = records.find(r => r.id === button.dataset.id); if (!record) return;
    if (button.dataset.action === 'edit') return openForm(record);
    if (button.dataset.action === 'requested') return persist(records.map(r => r.id === record.id ? { ...r, alertSent: true } : r));
    if (button.dataset.action === 'delete' && confirm('Excluir o cadastro de ' + record.driverName + ' na ' + record.operation + '?')) {
      try { persist(records.filter(r => r.id !== record.id)); }
      catch (error) { message('Não foi possível excluir: ' + error.message, true); }
    }
  };
  document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
    render();
  });
  render();
  setInterval(render, 60000);
})();
