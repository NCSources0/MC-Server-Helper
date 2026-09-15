/**[Help](http://docs.modrinth.com/api/operations/searchprojects#query-parameters)*/
const modrinthFacets = {
  versions: ["26.2"],
  categories: ["fabric"],
  environment: ["client_only_server_optional", "server_only", "server_only_client_optional", "dedicated_server_only", "client_or_server", "client_or_server_prefers_both"],
  project_type: ["mod"]
};
const escapeRegex = /e\/\[(.*?)](.+?)\//g;
const folderIcons = {
  default: 'folder',
  mods: 'folder_code',
  config: 'folder_managed',
  logs: 'folder_info',
}
const fileIcons = {
  default: 'draft',
  jar: 'local_cafe',
  txt: 'description',
  properties: 'edit_document',
  toml: 'edit_document',
  yml: 'edit_document',
  json: 'file_json',
  png: 'file_png',
  csv: 'csv'
}

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
 * Switch to one of the `<main>` elements
 * @param { string } selector 
 */
function focusPage(selector) {
  const focused = document.querySelectorAll('[focus]');
  const elems   = document.querySelectorAll(selector);
  focused.forEach(e => e.removeAttribute('focus'));
  elems  .forEach(e => e.setAttribute('focus', ''));
}

/**
 * Toggles the `.shown` class on the `.quick-settings` element
 */
function toggleQuickSettings() {
  document.querySelector('.quick-settings').classList.toggle('shown');
}

/**
 * Switch to one of the elements in `.run-control`
 * @param { Promise<number> } s
 */
async function updateStatus(s = undefined) {
  server.status = s != undefined ? s:server.status;
  const i = s != undefined ? s : ['Offline', 'Loading', 'Online'].indexOf(await server.getStatus());
  const selector = ['start', 'loading', 'stop'][i];

  const elems = document.querySelectorAll(`.run-control > *`);
  elems.forEach(e => e.classList.add('hidden'));

  document.querySelector('div.status').style.background = ['#f00', '#00f', '#0f0'][i];
  document.querySelector(`.run-control *.${selector}`).classList.remove('hidden');
  if (selector != 'loading') document.querySelector(`.run-control button.settings`).classList.remove('hidden');
  return s;
}

/**
 * Get data via `GET` or `POST` depending on weather `body` exists
 * @param { string } location 
 * @param { object } body 
 * @returns { Promise<Response> }
 */
async function get(location, headers = {}) {
  headers.user = localStorage.getItem('user');
  headers.pass = localStorage.getItem('pass');
  return fetch(location, {
    method: 'GET',
    headers
  });
}

/**
 * Gets all versions of Minecraft supported by Fabric
 * @param { boolean } snapshots 
 * @returns { Promise<string[]> }
 */
async function getMinecraftVersions(beta = flase) {
  const request = await get('https://meta.fabricmc.net/v2/versions/game');
  const versions = await request.json();
  return (beta ? versions : versions.filter(e => e.stable)).map(e => e.version);
}

/**
 * Gets all versions of the Fabric Loader
 * @param { boolean } beta 
 * @returns { Promise<string[]> }
 */
async function getLoaderVersions(beta = flase) {
  const request = await get('https://meta.fabricmc.net/v2/versions/loader');
  const versions = await request.json();
  return (beta ? versions : versions.filter(e => e.stable)).map(e => e.version);
}

/**
 * Parses a `.properties` file
 * @param { string } file 
 * @returns {[{ key:any }]}
 */
function parseProperties(file) {
  const matches = [...file.matchAll(/^([^#][^=]*)=(.*)$/gm)];
  const object = {};
  matches.forEach(m => object[m[1].trim()] = m[2].trim());
  return object;
}

/**
 * Gets all versions of the Fabric Server Installer
 * @param { boolean } beta 
 * @returns { Promise<string[]> }
 */
async function getInstallerVersions(beta = flase) {
  const request = await get('https://meta.fabricmc.net/v2/versions/installer');
  const versions = await request.json();
  return (beta ? versions : versions.filter(e => e.stable)).map(e => e.version);
}

const server = {
  status: 0,
  log: '',
  mods: [],
  /**
   * Gets the current status of the Minecraft server
   * @returns { Promise<string> }
   */
  async getStatus() {
    const request = await get('/api/status');
    const text = await request.text();
    server.status = ['Offline', 'Loading', 'Online'].indexOf(text);
    return text;
  },
  /**
   * checks if the Minecraft server is online
   * @returns { Promise<boolean> }
   */
  async online() {
    return await server.getStatus() == 'Online';
  },
  /**
   * Reboots the Minecraft server
   * @returns { Promise<boolean> }
   */
  async reboot() {
    let request = await get('/api/power/stop');

    request = await get('/api/power/start');
    return request.ok;
  },
  /**
   * Flips the switch on the Minecraft server  
   * If it's on, it's now off  
   * If it's off, it's now on
   * @returns { Promise<boolean> }
   */
  async flip() {
    updateStatus(1);
    const status = await server.getStatus();
    if (status == 'Loading') {
      updateStatus(server.status);
      return false;
    }

    if (status == 'Online') {
      const request = await get('/api/power/stop');
      return request.ok;
    }

    const request = await get('/api/power/start');
    if (!request.ok) return false;
  },
  /**
   * Sends commands to the server
   * @param { string[] } commands
   * @returns { Promise<boolean> }
   */
  async send(commands) {
    get('')
  } 
};

/**
 * Parses the incoming data from the server
 * @param { string } text 
 * @returns {{ content: string, calls: { call: string }}}
 */
function parseIncoming(text) {
  const matches = [...text.matchAll(escapeRegex)];
  const { length } = matches;
  const calls = {};
  for (let i = 0; i < length; i++) {
    const e = matches[i];
    calls[e[2]] = e[1];
    text = text.replace(e[0], '');
  }
  return { content: text.replaceAll('//', '/'), calls }
}

// Make sidebar buttons switch pages when clicked
const sidebarButtons = document.querySelectorAll('.sidebar button');
sidebarButtons.forEach(e => {
  e.onclick = () => focusPage(`.${e.classList[0]}`);
});

/**
 * Listens to `/api/log` and updates `status` and `log` as needed
 */
async function listen() {
  const request = await get('/api/log')
  server.log = '';

  const reader  = request.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const { content, calls } = parseIncoming(text);
    console.log(content);
    for(const key in calls) {
      const data = calls[key];
      console.log(`"${key}" is "${data}"`);
      if (key == 'CHANGE STATUS') {
        updateStatus(data);
        continue;
      }
      if (key == 'RESET LOG') {
        server.log = '';
        continue;
      }
      if (key == 'RELOAD MODS') {
        const req = await get('/serverMods.json');
        if (!req.ok) return;
        server.mods = await req.json();
        updateLocalMods();
        continue;
      }
      console.warn(`Call name "${key}" is not supported.`);
    }
    server.log += content;
  }

  console.log('Can\'t listen anymore.');
}
listen();

async function searchModrinth(query) {
  const search = query => `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query || '')}&limit=100&facets=${encodeURIComponent(JSON.stringify(packFacets(modrinthFacets)))}`;
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
    b.addEventListener('click', () => {
      const req = get('/api/project/download', { project: id, version: 'release' });
      if (!req.ok) return;
      const span = b.querySelector('span')
      span.innerHTML = 'progress_activity';
      b.classList.add('rotate');
      b.parentElement.classList.add('no-action');
    });
  });
}

const onlineToggle = document.querySelector('div.search button.online');
const modSearch    = document.querySelector('div.search input');
const searchOnline = () => onlineToggle.classList.contains('toggled');

modSearch.addEventListener('input', () => {
  modSearch.value = modSearch.value.replaceAll('\n', '');
  const q = modSearch.value
  if (searchOnline()) searchModrinth(q);
  else updateMods(server.mods.filter(m => m.name.includes(q) || m.slug.includes(q) || m.id.includes(q) || m.description.includes(q) || m.path.includes(q)));
});

onlineToggle.addEventListener('click', () => {
  onlineToggle.classList.toggle('toggled');
  if (searchOnline()) searchModrinth();
  else updateLocalMods();
});

async function updateLocalMods() {
  if (searchOnline()) return;
  updateMods(server.mods);
}