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

// Make sidebar buttons switch pages when clicked
const sidebarButtons = document.querySelectorAll('.sidebar button');
sidebarButtons.forEach(e => {
  e.onclick = () => focusPage(`.${e.classList[0]}`);
});