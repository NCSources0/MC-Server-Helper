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
};

const folderIcons = {
  default: 'folder',
  mods: 'folder_code',
  config: 'folder_managed',
  logs: 'folder_info',
};

const parse = {
  /**
   * Parses a `.properties` file
   * @param { string } file 
   * @returns {{}}
  */
  properties(file) {
    const matches = [...file.matchAll(/^([^#][^=]*)=(.*)$/gm)];
    const object = {};
    matches.forEach(m => object[m[1].trim()] = m[2].trim());
    return object;
  },
  
}

async function getDir(path) {
  const res = await get('/api/files/read-dir', { filepath: path });
  if (!res.ok) return await res.text();

  return JSON.parse(await res.text());
}

async function getFile(path) {
  const res = await get('/api/files/read-file', { filepath: path });
  return await res.text();
}

async function writeFile(path, data) {
  const res = await get('/api/files/write-file', { filepath: path, data });
  return await res.text();
}