const fs        = require('fs');
const path      = require('path');
const bcrypt    = require('bcrypt');
const express   = require('express');
const fsp       = require('fs/promises');
const cp        = require('child_process');
const basicAuth = require('express-basic-auth');
const { log, warn, err, download, writable, readable } = require('./helper.js');
const EventEmitter = require('events');

log('Packages Loaded');

const app = express();
log('App Initalized');
const { users } = JSON.parse(fs.readFileSync('users.json'));
log('Users Loaded');
const installedVersions = JSON.parse(fs.readFileSync('./public/versions.json'));
log('Versions Loaded');
const modrinthIndex = JSON.parse(fs.readFileSync('./public/modrinth.index.json'));
log('Modrinth Index Loaded');
const server = {
  startRegex: /^\[\d+:\d+:\d+] \[Server thread\/INFO]: Done \(\d\.?\d+s\)! For help, type "help"/m,
  stopRegex:  /^\[\d+:\d+:\d+] \[Server thread\/INFO]: Stopping the server/m,
  stopTime: 0,
  status:   0,
  log:      '',
  send:  command => log(server.write(command)),
  write: command => { server.stdin().write(`${command}\n`); return command },
  stdout: () => server.process.stdout,
  stderr: () => server.process.stderr,
  stdin:  () => server.process.stdin,
  process: cp.spawn('echo'),
  uuid: crypto.randomUUID(),
  emitter: new EventEmitter(),
  mods: JSON.parse(fs.readFileSync('./public/serverMods.json'))
};
log('Global Server Object Loaded');
const serverPath = path.resolve('./');
log('Found Base Path');

/**
 * Authorize a user
 * @param { string } user
 * @param { string } pass
 * @returns { Promise<boolean> }
 */
function auth(user, pass, cb) {
  if (!users[user]) return cb(null, false);
  bcrypt.compare(pass, users[user]).then(res => cb(null, res));
}
log('User Authorization Function Loaded');

/**
 * Download Fabric Server Installer
 * @param { string } gameVer      Minecraft Version (https://meta.fabricmc.net/v2/versions/game)
 * @param { string } loaderVer    Fabric Server Loader Version (https://meta.fabricmc.net/v2/versions/loader)
 * @param { string } installerVer Fabric Server Installer version (https://meta.fabricmc.net/v2/versions/installer)
 */
async function downloadInstaller(gameVer = 'stable', loaderVer = 'stable', installerVer = 'stable') {
  const result = await fetch('https://meta.fabricmc.net/v2/versions');
  if (!result.ok) return [err('Could not load versions from Fabric.')];
  const { game, loader, installer } = await result.json();

  if (gameVer == 'stable') gameVer = game.filter(e => e.stable)[0].version;
  else if (gameVer == 'beta') gameVer = game[0].version;
  else if (!game.find(e => e.version == gameVer)) return [err('Invalid game version.')];

  if (loaderVer == 'stable') loaderVer = loader.filter(e => e.stable)[0].version;
  else if (loaderVer == 'beta') loaderVer = loader[0].version;
  else if (!loader.find(e => e.version == loaderVer)) return [err('Invalid loader version.')];

  if (installerVer == 'stable') installerVer = installer.filter(e => e.stable)[0].version;
  else if (installerVer == 'beta') installerVer = installer[0].version;
  else if (!installer.find(e => e.version == installerVer)) return [err('Invalid installer version.')];

  if (await download(`https://meta.fabricmc.net/v2/versions/loader/${gameVer}/${loaderVer}/${installerVer}/server/jar`, "./server/fabric-installer.jar")) {
    installedVersions.game = gameVer;
    installedVersions.loader = loaderVer;
    installedVersions.installer = installerVer;

    modrinthIndex.dependencies.minecraft = gameVer;
    modrinthIndex.dependencies.fabric = loaderVer;
    await updateModrinthIndex();

    await fsp.writeFile('./public/versions.json', JSON.stringify(installedVersions));
    await fsp.writeFile('./server/eula.txt', 'eula=true');
    return log(`Updated Minecraft to ${gameVer}, Fabric Loader to ${loaderVer}, and Fabric Server to ${installerVer}.`);
  }
}
log('Installer Downloading Function Loaded');
downloadInstaller('26.2', )

/**
 * Downloads a project from Modrinth
 * @param { string } project 
 * @param { string } projectVer 
 * @returns { Promise<string | string[]> }
 */
async function downloadProject(project, projectVer = 'release', force = false, ignoreEnvironment = false) {
  const versionsRequest = await fetch(`https://api.modrinth.com/v2/project/${project}/version`);
  if (!versionsRequest.ok) return [err(`Project "${project}" does not exist.`)];
  const versions = await versionsRequest.json();

  const detailsRequest = await fetch(`https://api.modrinth.com/v2/project/${project}`);
  if (!detailsRequest.ok) warn(`Project "${project}" failed the details check.`);
  const { icon_url, slug, title, description } = detailsRequest.ok?  await detailsRequest.json() : {icon_url: null, slug: null, title: null, description: null};
  log(`Downloading "${title}"`);

  let version = {};
  if (['release', 'beta', 'alpha'].includes(projectVer)) {
    // Find any version that is the latest release, erroring the exact reason why latest won't work.
    version = versions.find(v =>
      v.game_versions.includes(installedVersions.game) &&
      v.loaders.includes('fabric') &&
      v.version_type == projectVer
    ) || versions.find(v =>
      v.game_versions.includes(installedVersions.game) &&
      v.version_type == projectVer
    ) || versions.find(v => v.version_type == projectVer);
  }
  // Find the version specified
  else version = versions.find(v => 
    v.name == projectVer ||
    v.version_number == projectVer ||
    v.id == projectVer
  );

  // Exists check
  if (!version)
    return [err(`Version "${projectVer}" of "${title}" does not exist.`)];
  // Fabric supported check
  if (!version.loaders.includes('fabric'))
    return [err(`Version "${projectVer}" of "${title}" does not support Fabric.`)];
  // Version supported check
  if (!version.game_versions.includes(installedVersions.game))
    return [err(`Version "${projectVer}" of "${title}" was not made for ${installedVersions.game}.`)];
  // Non-client-only check
  if (!version.environment.includes('server') && version.environment != 'unknown' && !ignoreEnvironment)
    return [err(`Version "${projectVer}" of "${title}" is not made for Fabric Servers.`)];

  const file = version.files.find(f => f.primary) || version.files[0];
    const modIndex = server.mods.findIndex(f => f.id == version.project_id);
    const mod = modIndex == -1 ? null : server.mods[modIndex];
    if (mod && mod.version == file.id && !force) return [err(`Version "${projectVer}" of "${title}" was already downloaded. Use force to replace it.`)];
    const filename = file.filename + (mod?.path?.endsWith('.disabled') ? '.disabled' : '');

  const { dependencies } = version;
  if (await download(file.url, `./server/mods/${filename}`)) {
    const modIndex = server.mods.findIndex(f => f.id == version.project_id);
    const mod = modIndex == -1 ? null : server.mods[modIndex];

    const fileIndex = modrinthIndex.files.findIndex(f => f.path == mod?.path);
    const fileObject = {
      path: `mods/${filename}`,
      hashes: file.hashes,
      downloads: [file.url],
      fileSize: file.size
    };

    if (fileIndex != -1) modrinthIndex.files[fileIndex] = fileObject
    else if (version.environment.includes('client') || version.environment == 'unknown')
      modrinthIndex.files.push(fileObject);

    if (dependencies?.length) {
      const required = dependencies.filter(d => d.dependency_type == 'required');

      for (const depend of required)
        await downloadProject(depend.project_id, depend.version_id || 'release', false, true);
    }

    if (mod && mod.version != file.id) fs.unlink(path.resolve('./server', mod?.path), () => {});
    const update = {
      name: title,
      slug,
      id: version.project_id,
      version: file.id,
      description,
      icon: icon_url,
      path: `mods/${filename}`
    };
    if (mod) server.mods[modIndex] = update;
    else     server.mods.push(update);
    await updateModrinthIndex();

    return log(`Downloaded "${title}" successfully`);
  }
  return [err(`Could not download "${title}"`)];
}
log('Project Downloading Function Loaded');

/**
 * Toggle the `.disabled` file extension
 * @param { string } project 
 * @returns { Promise<string | string[]> }
 */
async function toggleProject(project) {
  const modIndex = server.mods.findIndex(m => [m.name, m.slug, m.id].includes(project));
  if (modIndex == -1) return [err(`"${project}" could not be found.`)];

  const oldName  = server.mods[modIndex].path;
  const enabling = oldName.endsWith('.disabled');
  const newName  = enabling ? oldName.slice(0, -'.disabled'.length) : oldName + '.disabled';
  const oldPath  = path.resolve('./server', oldName);
  const newPath  = path.resolve('./server', newName);

  if (!await writable(oldPath)) return [err(`"${project}" is not writable.`)];

  await fsp.rename(oldPath, newPath);
  const fileIndex = modrinthIndex.files.findIndex(f => f.path == oldName);
  if (fileIndex >= 0) modrinthIndex.files[fileIndex].path = newName;
  server.mods[modIndex].path = newName;
  await updateModrinthIndex();

  return log(`"${project}" is now ${enabling ? 'enabled' : 'disabled'}.`);
}
log('Project Toggling Function Loaded');

/**
 * Deletes a project from `./server/mods/`
 * @param { string } project 
 * @returns { Promise<string | string[]> }
 */
async function deleteProject(project) {
  const modIndex = server.mods.findIndex(m => [m.name, m.slug, m.id].includes(project));
  if (modIndex == -1) return [err(`"${project}" could not be found.`)];

  const { path: modPath } = server.mods[modIndex];
  try {await fsp.unlink(path.resolve('./server', modPath))} catch {}
  const fileIndex = modrinthIndex.files.findIndex(f => f.path == modPath);
  if (fileIndex >= 0) modrinthIndex.files.splice(fileIndex, 1);
  server.mods.splice(modIndex, 1);
  await updateModrinthIndex();
  return log(`Deleted "${project}"`)
}
log('Project Deleting Function Loaded');

/**
 * Updates `./public/modrinth.index.json` with data from `modrinthIndex`
 * Updates `./public/serverMods.json` with data from `server.mods`
 */
async function updateModrinthIndex() {
  await fsp.writeFile('./public/modrinth.index.json', JSON.stringify(modrinthIndex, null, 2));
  await fsp.writeFile('./public/serverMods.json', JSON.stringify(server.mods, null, 2));
  server.emitter.emit('indexUpdate');
}
log('Modrinth Index Updating Function Loaded');

/**
 * Changes the status of the server and emits `statusChange` to `server.emitter`
 * @param { number } s
 * @returns { number }
 */
function changeStatus(s) {
  server.status = s;
  server.emitter.emit('statusChange', s);
  return s;
}
log('Status Changing Function Loaded');

/**
 * Reads a directory
 * @param { fs.PathLike } dirpath 
 * @returns {Promise<[] | string>}
 */
async function readDir(dirpath = './') {
  if (typeof dirpath != 'string') return err(`Type of "dirPath" is not string.`);

  const dirPath = path.resolve('./server', dirpath);
  if (!dirPath.startsWith(serverPath + '/') && dirPath != serverPath) return err(`"${dirpath}" must be inside "./server"`);
  if (!await readable(dirPath)) return err(`"${dirpath}" must be readable.`);
  if (!(await fsp.stat(dirPath)).isDirectory()) return [err(`'${dirpath}' must be a directory.`)];

  const files = await fsp.readdir(dirPath, { encoding: 'utf8', withFileTypes: true });
  return files.map(f => {return { path: path.resolve(f.parentPath, f.name), name: f.name, type: f.isDirectory() ? 'directory' : 'file' }});
}
log('Directory Reading Function Loaded');

/**
 * Reads a file
 * @param { fs.PathLike } filepath 
 * @returns { Promise<string | string[]> }
 */
async function readFile(filepath = './') {
  if (typeof filepath != 'string') return err(`Type of "filePath" is not string.`);

  const filePath = path.resolve('./server', filepath);
  if (!filePath.startsWith(serverPath + '/')) return [err(`"${filepath}" must be inside "./server"`)];
  if (!await readable(filePath)) return [err(`"${filepath}" must be readable.`)];
  if (!(await fsp.stat(filePath)).isFile()) return [err(`'${filepath}' must be a file.`)];

  return await fsp.readFile(filePath, { encoding: 'utf8' });
}
log('File Reading Function Loaded');

/**
 * Writes to a file
 * @param { fs.PathLike } filepath 
 * @param { string } data 
 * @returns {Promise<true | string>}
 */
async function writeFile(filepath, data) {
  if (typeof filepath != 'string') return err(`Type of "filePath" is not string.`);
  if (typeof data != 'string') return err(`Type of "data" is not string.`);

  const filePath = path.resolve('./server', filepath);
  if (!filePath.startsWith(serverPath + '/')) return err(`"${filepath}" must be inside "./server"`);
  if (!await writable(filePath)) return err(`"${filepath}" must be writable.`);
  if (!(await fsp.stat(filePath)).isFile()) return err(`${filepath} must be a file.`);

  await fsp.writeFile(filePath, data, { encoding: 'utf8' });
  return true;
}
log('File Writing Function Loaded');

app.use(basicAuth({
  authorizeAsync: true,
  challenge: true,
  authorizer: auth,
  realm: 'NCSources0\'s Admin Dashboard',
  unauthorizedResponse: 'Incorrect username or password provided.'
}));
log('Basic Auth Loaded');
app.use(express.static('public'));
log('Express Loaded');

app.get('/api/status', (_, res) => {
  res.status(200).send(['Offline', 'Loading', 'Online'][server.status]);
});
log('Registered /api/status');

app.get('/api/log', (_, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.write(`${server.log}e/[${server.status}]CHANGE STATUS/e/[]RELOAD MODS/`);

  const resetLog = () => res.write(`e/[]RESET LOG/`);
  const log = data => res.write(data.replaceAll('/', '//'));
  const statusChange = status => res.write(`e/[${status}]CHANGE STATUS/`);
  const indexUpdate = () => res.write(`e/[]RELOAD MODS/`);

  server.emitter.on('resetLog', resetLog);
  server.emitter.on('log', log);
  server.emitter.on('statusChange', statusChange);
  server.emitter.on('indexUpdate', indexUpdate);
  res.once('close', () => {
    server.emitter.off('resetLog', resetLog);
    server.emitter.off('log', log);
    server.emitter.off('statusChange', statusChange);
    server.emitter.off('indexUpdate', indexUpdate);
  });
});
log('Registered /api/log');

app.get('/api/send', (req, res) => {
  if (server.status != 2) return res.status(409).send('Server is not online.');

  let { commands } = req.headers;
  if (!commands) return res.status(400).send('Missing "commands"');
  if (typeof commands != 'string') return res.status(400).send('Type of "commands" is not string.');
  
  const commandArr = commands.split('\n');
  const { length } = commandArr;
  for (let i = 0; i < length; i++) {
    const command = commandArr[i];
    if (command.trim().length) server.send(command.trim() + '\n');
  }
  res.status(200).send('Commands sent successfully.');
});
log('Registered /api/send?commands');

app.get('/api/server/update', async (req, res) => {
  if (server.status != 0) return res.status(409).send('Server is not offline.');

  const { game, loader, installer } = req.headers;
  if (game || loader || installer) {
    if (typeof game != 'string')      return res.status(400).send('Type of "game" is not string.');
    if (typeof loader != 'string')    return res.status(400).send('Type of "loader" is not string.');
    if (typeof installer != 'string') return res.status(400).send('Type of "installer" is not string.');
  }

  const result = await downloadInstaller(game || 'stable', loader || 'stable', installer || 'stable');
  if (typeof result == 'string') return res.status(200).send(result);
  else return res.status(500).send(result[0]);
});
log('Registered /api/server/update?game&loader&installer');

app.get('/api/power/stop', (req, res) => {
  if (server.status != 2) return res.status(409).send('Server is not online.');
  let { stoptime } = req.headers;
  if (stoptime && (!Number.isFinite(+stoptime) || +stoptime < 0)) return res.status(400).send('Header stoptime is malformed. Must be a positive integer.');
  changeStatus(1);

  stoptime = stoptime ? +stoptime : server.stopTime;
  let i = stoptime;
  server.send(`say ${i} seconds until server stops.`);
  const warning = setInterval(() => {
    i--;
    server.send(`say ${i} seconds until server stops.`);
    if (i <= 0) {
      server.send('stop');
      clearInterval(warning);
      res.status(200).send('Server stopped successfully.');
    }
  }, 1000);
});
log('Registered /api/power/stop');

app.get('/api/power/start', (_, res) => {
  if (server.status != 0) return res.status(409).send('Server is not offline.');

  const send = d => {
    server.log += d;
    server.emitter.emit('log', d);
    process.stdout.write(d);
    return d;
  };

  server.log = '';
  server.process = cp.spawn('java', ['-Xms4G', '-Xmx12G', '-jar', 'fabric-installer.jar', 'nogui'], {cwd: './server'});
  changeStatus(1);
  server.uuid = crypto.randomUUID();

  let started = 0;
  server.stdout().on('data', d => {
    send(d.toString());
    if (!started) if (server.startRegex.test(server.log)) {
      changeStatus(2);
      res.status(200).send('Server has started.');
      started++;
    }
    if (server.status == 2) if (server.stopRegex .test(server.log)) changeStatus(1);
  });
  server.stderr().on('data', d => send(d.toString()));
  server.process.once('exit', () => {
    changeStatus(0);
    log('Minecraft Server Has Stopped.');
  });
});
log('Registered /api/power/start');

let changingMods = false;
app.get('/api/project/download', async (req, res) => {
  if (changingMods) return res.status(409).send('Mods are being updated. Try again later.');
  changingMods = true;
  try {
    if (server.mods.find())
    if (server.status != 0) return res.status(409).send('Server is not offline.');

    let { project, version, replace, serveronly } = req.headers;
    replace    = replace == 'true';
    serveronly = serveronly != 'false';

    if (typeof project != 'string') return res.status(400).send('Type of "project" is not string.');
    if (typeof version != 'string') return res.status(400).send('Type of "version" is not string.');

    const result = await downloadProject(project, version || 'release', replace, serveronly);
    if (typeof result == 'string') return res.status(200).send(result);

    return res.status(500).send(result[0]);
  } finally {
    changingMods = false;
    server.emitter.emit('indexUpdate');
  }
});
log('Registered /api/project/download?project&version&replace&serveronly');

app.get('/api/project/toggle', async (req, res) => {
  if (changingMods) return res.status(409).send('Mods are being updated. Try again later.');
  changingMods = true;
  try {
    if (server.status != 0) return res.status(409).send('Server is not offline.');

    const { project } = req.headers;
    if (typeof project != 'string') return res.status(400).send('Type of "project" is not string.');

    const result = await toggleProject(project);
    if (typeof result == 'string') return res.status(200).send(result);

    return res.status(500).send(result[0]);
  } finally {
    changingMods = false;
    server.emitter.emit('indexUpdate');
  }
});
log('Registered /api/project/toggle?project');

app.get('/api/project/delete', async (req, res) => {
  if (changingMods) return res.status(409).send('Mods are being updated. Try again later.');
  changingMods = true;
  try {
    if (server.status != 0) return res.status(409).send('Server is not offline.');

    const { project } = req.headers;
    if (typeof project != 'string') return res.status(400).send('Type of "project" is not string.');

    const result = await deleteProject(project);
    if (typeof result == 'string') return res.status(200).send(result);

    return res.status(500).send(result[0]);
  } finally {
    changingMods = false;
    server.emitter.emit('indexUpdate');
  }
}); 
log('Registered /api/project/delete?project');

app.get('/api/files/read-dir', async (req, res) => {
  const { filepath } = req.headers;
  const result = await readDir(filepath);
  if (typeof result == 'object') return res.status(200).send(JSON.stringify(result));
  return res.status(500).send(result);
});
log('Registered /app/files/read-dir?filepath');

app.get('/api/files/read-file', async (req, res) => {
  const { filepath } = req.headers;
  const result = await readFile(filepath);
  if (typeof result == 'string') return res.status(200).send(result);
  return res.status(500).send(result[0]);
});
log('Registered /app/files/read-file');

const fileOperations = [];
app.get('/api/files/write-file', async (req, res) => {
  const { path: filePath, data } = req.headers;

  if (fileOperations.includes(filePath)) return res.status(409).send('This file is currently being written to. Try again later.');
  fileOperations.push(filePath);

  try {
    const result = await writeFile(filePath, data);
    if (typeof result == 'boolean') return res.status(200).send('Successfully wrote to ' + filePath);
    return res.status(500).send(result);
  } finally {fileOperations.splice(fileOperations.indexOf(filePath), 1)}
});
log('Registered /app/files/write-file');

app.listen(80, '0.0.0.0', () => log('Listening on http://127.0.0.1'));
