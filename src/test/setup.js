// jsdom does not implement getComputedStyle(element, pseudoElement), which Ant Design calls to measure scrollbars.
// Ignoring the pseudo-element argument keeps tests quiet and fast. Production code is not affected.
if (typeof window !== 'undefined') {
  const getComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element) => getComputedStyle(element);
}
