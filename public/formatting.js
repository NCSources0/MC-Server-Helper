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

// Make sidebar buttons switch pages when clicked
const sidebarButtons = document.querySelectorAll('.sidebar button');
sidebarButtons.forEach(e => {
  e.onclick = () => focusPage(`.${e.classList[0]}`);
});