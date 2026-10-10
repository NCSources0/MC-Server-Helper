/**[Help](http://docs.modrinth.com/api/operations/searchprojects#query-parameters)*/
const modrinthFacets = {
  versions: ["26.2"],
  categories: ["fabric"],
  environment: ["client_only_server_optional", "server_only", "server_only_client_optional", "dedicated_server_only", "client_or_server", "client_or_server_prefers_both"],
  project_type: ["mod"]
};

/**
 * Pack facets into one array
 * @param { {} } obj 
 * @returns { string[] }
 */
function packFacets(obj) {
  const facets = [];
  for (const key in obj) {
    const e = obj[key].map(f => `${key}:${f}`);
    facets.push(e);
  }
  return facets;
}

/**
 * Searches Modrinth for mods
 * @param { string } query 
 */
async function searchModrinth(query) {
  const search = query => `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query || '')}&index=downloads&limit=100&facets=${encodeURIComponent(JSON.stringify(packFacets(modrinthFacets)))}`;
  const request = await get(search(query));
  const json = await request.json();
  console.log(json);
  const { hits } = json;
  updateMods(hits.map(hit => {return {
    name: hit.title,
    slug: hit.slug,
    id: hit.project_id,
    version: hit.latest_version,
    description: hit.description,
    icon: hit.icon_url,
    path: hit.slug
  }}));
}

/**
 * Parses and displays an array like `server.mods`
 * @param { [] } modsArray 
 */
function updateMods(modsArray) {
  const projects = document.querySelector('main.mods > div.projects');
  projects.innerHTML = '';
  const generateCard = cardData => `
<div class="project${cardData.path.endsWith('.disabled') ? ' disabled' : ''}${searchOnline() ? ' online' : ''}">
  <image src="${cardData.icon || "https://minecraft.wiki/images/Java_Edition_icon_3.png"}"></image>
  <header>${cardData.name}&ensp;<span class="path id">${cardData.id}</span></header>
  <span class="desc">${cardData.description}</span>
  <span class="path">${cardData.path.replace(/^.*\//, '')}</span>
  <button class="update fill"><span>download</span></button>
  <button class="toggle fill"><div></div></button>
  <button class="delete fill"><span>${searchOnline() ? 'open_in_new' : 'delete'}</span></button>
</div>
`;

  modsArray.sort();
  modsArray.forEach(mod => projects.innerHTML += generateCard(mod));

  projects.querySelectorAll('div.project.online').forEach(p => {
    const id = p.querySelector('header span.path').textContent;
    const modIndex = server.mods.findIndex(m => m.id == id);
    if (modIndex != -1) p.classList.add('disabled', 'no-action')
  });

  projects.querySelectorAll('div.project button.toggle').forEach(b => {
    const id = b.parentElement.querySelector('span.path.id').textContent;
    b.addEventListener('click', () => {
      get('/api/project/toggle', { project: id });
      b.parentElement.classList.toggle('disabled');
    });
  });

  projects.querySelectorAll('div.project button.delete').forEach(b => {
    const id = b.parentElement.querySelector('span.path.id').textContent;
    b.addEventListener('click', () => {
      if (searchOnline()) return open('http://modrinth.com/mod/' + id);
      get('/api/project/delete', { project: id });
      b.parentElement.remove();
    });
  });

  projects.querySelectorAll('div.project button.update').forEach(b => {
    const id = b.parentElement.querySelector('span.path.id').textContent;
    b.addEventListener('click', async () => {
      let req = await get('/api/project/download', { project: id, version: 'release' });
      if (!req.ok) get('/api/project/download', { project: id, version: 'beta' });
      if (!req.ok) get('/api/project/download', { project: id, version: 'alpha' });
      if (!req.ok) return req.text();
      const span = b.querySelector('span');
      span.innerHTML = 'progress_activity';
      b.classList.add('rotate');
      b.parentElement.classList.add('no-action');
    });
  });
}

const onlineToggle = document.querySelector('div.search button.online');
const modSearch    = document.querySelector('div.search input');
const searchOnline = () => onlineToggle.classList.contains('toggled');

const filterMods = q => server.mods.filter(m => m.name.includes(q) || m.slug.includes(q) || m.id.includes(q) || m.description.includes(q) || m.path.includes(q));

let searchTimeout;
modSearch.addEventListener('input', () => {
  modSearch.value = modSearch.value.replaceAll('\n', '');
  const q = modSearch.value
  if (searchOnline()) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchModrinth(q), 500); // Search wait
  }
  else updateMods(filterMods(q));
});

onlineToggle.addEventListener('click', () => {
  onlineToggle.classList.toggle('toggled');
  if (searchOnline()) searchModrinth(modSearch.value);
  else updateLocalMods();
});

async function getMods() {
  const req = await get('/serverMods.json');
  if (!req.ok) return;
  server.mods = await req.json();
  updateLocalMods();
}

/**
 * Updates mods list when told there is a new mod
 */
async function updateLocalMods() {
  if (searchOnline()) return;
  updateMods(filterMods(modSearch.value));
}