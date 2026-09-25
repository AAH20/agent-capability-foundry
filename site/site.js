const cards = document.getElementById('cards');
const count = document.getElementById('count');
function el(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; }
function link(label, href, alt = false) { const node = el('a', `button${alt ? ' alt' : ''}`, label); node.href = href; return node; }
function render(item) {
  const card = el('article', 'card'); card.id = item.id;
  const head = el('div', 'cardhead'); head.append(el('span', '', item.category), el('span', '', `v${item.version}`)); card.append(head);
  card.append(el('h3', '', item.title), el('p', '', item.tagline));
  const chips = el('div', 'chips'); for (const tool of item.tooling) chips.append(el('span', 'chip', tool)); card.append(chips);
  card.append(el('div', 'meta', `Synthetic cases: ${item.syntheticAccepted}/${item.syntheticEligible} accepted · self-declared publisher: ${item.publisher}`));
  const actions = el('div', 'actions'); actions.append(link('Download pack', item.packUrl), link('View source', item.sourceUrl, true)); card.append(actions);
  const command = el('code', 'command', `node src/network-cli.js install ${item.id}@${item.version} local/${item.id}.pack.json`); command.style.marginTop = '16px'; card.append(command);
  return card;
}
fetch('catalog.json', { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`); return response.json(); }).then(data => { if (data.schemaVersion !== 1 || !Array.isArray(data.capabilities)) throw new Error('Invalid catalog'); count.textContent = `${data.capabilities.length} releases`; cards.replaceChildren(...data.capabilities.map(render)); }).catch(error => { count.textContent = 'Unavailable'; cards.textContent = error.message; });
