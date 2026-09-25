const $ = id => document.getElementById(id);
let entries = [];
let selected = null;
function element(tag, cls, value) { const node = document.createElement(tag); if (cls) node.className = cls; if (value !== undefined) node.textContent = value; return node; }
function download(name, data) { const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = element('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function json(url, options) { const response = await fetch(url, { cache: 'no-store', ...options }); const data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); return data; }
function select(entry) {
  selected = entry;
  $('selected-title').textContent = entry.title;
  $('selected-desc').textContent = entry.tagline;
  $('run').disabled = $('download').disabled = $('fork').disabled = false;
  $('result').className = 'result empty'; $('result').textContent = `Ready to run ${entry.id} on bundled synthetic cases.`;
  $('fork-id').value = `my-${entry.id}`;
  $('fork-message').textContent = '';
  for (const card of document.querySelectorAll('.card')) card.classList.toggle('active', card.dataset.id === entry.id);
  $('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderCards() {
  $('count').textContent = `${entries.length} available`;
  const grid = $('cards'); grid.replaceChildren();
  entries.forEach((entry, index) => {
    const card = element('article', 'card'); card.dataset.id = entry.id;
    const top = element('div', 'cardtop'); top.append(element('span', 'number', `0${index + 1} / CAPABILITY`), element('span', 'tag', entry.category)); card.append(top);
    card.append(element('h3', '', entry.title), element('p', '', entry.tagline));
    const chips = element('div', 'chips'); for (const tool of entry.tooling) chips.append(element('span', 'chip', tool)); card.append(chips);
    const button = element('button', '', 'Open capability →'); button.addEventListener('click', () => select(entry)); card.append(button); grid.append(card);
  });
}
function renderReport(report) {
  const root = $('result'); root.className = 'result'; root.replaceChildren();
  root.append(element('h3', '', `${report.status.toUpperCase()} · ${report.pack.id} · synthetic run`));
  root.append(element('p', 'helper', report.claim));
  const metrics = element('div', 'metrics');
  for (const [label, value] of [['Accepted', `${report.metrics.acceptedCases}/${report.metrics.eligibleCases}`], ['Acceptance', `${(report.metrics.acceptanceRate * 100).toFixed(0)}%`], ['Total invented cost', `${report.metrics.totalCostCents}¢`], ['Cost / accepted', `${report.metrics.costPerAcceptedCents ?? 'n/a'}¢`]]) { const box = element('div', 'metric'); box.append(element('strong', '', value), element('small', '', label)); metrics.append(box); }
  root.append(metrics);
  const table = element('table'); const head = element('tr'); for (const label of ['Case','Outcome','Action']) head.append(element('th', '', label)); table.append(head);
  for (const item of report.cases) { const row = element('tr'); row.append(element('td', '', item.id), element('td', item.outcome === 'accepted' ? 'ok' : 'warn', item.outcome.replaceAll('_', ' ')), element('td', '', item.closed || item.routed ? 'applied in fixture' : 'held / rejected')); table.append(row); }
  root.append(table, element('p', 'helper', `Report digest: ${report.reportDigest}`));
}
$('run').addEventListener('click', async () => { if (!selected) return; $('result').className = 'result empty'; $('result').textContent = 'Running local synthetic cases…'; try { renderReport(await json('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected.id }) })); } catch (error) { $('result').textContent = error.message; } });
$('download').addEventListener('click', async () => { if (!selected) return; try { download(`${selected.id}.pack.json`, await json(`/api/pack/${selected.id}`)); } catch (error) { $('fork-message').textContent = error.message; } });
$('fork').addEventListener('click', async () => { if (!selected) return; const id = $('fork-id').value.trim(); if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) { $('fork-message').textContent = 'Use 2–64 lowercase letters, numbers, and hyphens; start with a letter.'; return; } try { const pack = await json(`/api/pack/${selected.id}`); pack.id = id; pack.version = '0.1.0'; pack.description = `Local fork of ${selected.id}. ${pack.description ?? ''}`; download(`${id}.pack.json`, pack); $('fork-message').textContent = `Downloaded ${id}.pack.json. Edit it and run it locally.`; } catch (error) { $('fork-message').textContent = error.message; } });
json('/api/catalog').then(data => { entries = data.capabilities; renderCards(); }).catch(error => { $('count').textContent = 'Unavailable'; $('cards').textContent = error.message; });
