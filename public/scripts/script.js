const regex = {
  join: /^\[[0-9:.]+] \[Server thread\/INFO]: (\S+) joined the game$/gm,
  leave: /^\[[0-9:.]+] \[Server thread\/INFO]: (\S+) left the game$/gm,
  escape: /e\/\[(.*?)](.+?)\//g
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
 * Switch to one of the elements in `.run-control`
 * @param { Promise<number> } s
 */
async function updateStatus(s = undefined) {
  server.status = s != undefined ? s : server.status;
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
  players: [],
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
   * @param { string } commands Each command is serarated with a newline.
   * @returns { Promise<boolean> }
   */
  async send(commands) {
    get('/api/send', {commands})
  } 
};

/**
 * Parses the incoming data from the server
 * @param { string } text 
 * @returns {{ content: string, calls: { call: string }}}
 */
function parseIncoming(text) {
  const matches = [...text.matchAll(regex.escape)];
  const { length } = matches;
  const calls = {};
  for (let i = 0; i < length; i++) {
    const e = matches[i];
    calls[e[2]] = e[1];
    text = text.replace(e[0], '');
  }
  return { content: text.replaceAll('//', '/'), calls }
}

/**
 * Listens to `/api/log` and updates `server` as needed.
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
        await getMods();
        continue;
      }
      console.warn(`Call name "${key}" is not supported.`);
    }
    server.log += content;

    const joinedPlayers = content.matchAll(regex.join);
    if (joinedPlayers)
      joinedPlayers.forEach(p => server.players.push(p[1]));

    const leftPlayers = content.matchAll(regex.leave);
    if (leftPlayers)
      leftPlayers.forEach(p => server.players.splice(server.players.findIndex(v => v == p[1]), 1));
  }

  console.log('Can\'t listen anymore.');
}
listen();
updateStatus();
getMods();