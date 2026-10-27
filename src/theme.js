// Colour tokens are defined once, in the :root block of src/style.css.
// JS modules read them here instead of repeating hex codes (the stylesheet is loaded before main.js runs).
// The globe and ground view live on the map, which stays dark in both themes, so read the tokens there.
const styles = getComputedStyle(document.querySelector('.stage') || document.documentElement);

export function token(name) {
  const value = styles.getPropertyValue(`--${name}`).trim();
  if (!value) throw new Error(`Missing CSS colour token --${name} (see src/style.css :root)`);
  return value;
}
