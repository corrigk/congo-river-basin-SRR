// Chart export for slides and reports: an SVG chart with its computed colours, fonts and strokes written inline
// (the page styles them with CSS variables, which a standalone file does not have), as an .svg file or a 2x .png.
const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-size', 'font-weight', 'font-family', 'font-style', 'text-anchor', 'paint-order', 'stroke-linecap'];

export function svgString(svg, { background = true } = {}) {
  const clone = svg.cloneNode(true), src = [svg, ...svg.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((node, i) => {
    const cs = getComputedStyle(node);
    const style = PROPS.map(p => `${p}:${cs.getPropertyValue(p)}`).join(';');
    dst[i].setAttribute('style', style);
    dst[i].removeAttribute('class');
    // presentation attributes written with page variables mean nothing outside the page (the inline style wins anyway)
    for (const a of [...dst[i].attributes]) if (a.value.includes('var(')) dst[i].removeAttribute(a.name);
  });
  const vb = svg.viewBox.baseVal, w = vb?.width || svg.clientWidth, h = vb?.height || svg.clientHeight;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w); clone.setAttribute('height', h);
  if (background) {
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x: vb?.x || 0, y: vb?.y || 0, width: w, height: h, fill: getComputedStyle(document.body).backgroundColor || '#fff' }).forEach(([k, v]) => bg.setAttribute(k, v));
    clone.insertBefore(bg, clone.firstChild);
  }
  return { text: new XMLSerializer().serializeToString(clone), w, h };
}

const save = (name, blob) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';

export function downloadSvg(svg, name) { save(`${slug(name)}.svg`, new Blob([svgString(svg).text], { type: 'image/svg+xml' })); }

export function downloadPng(svg, name, scale = 2) {
  const { text, w, h } = svgString(svg);
  const img = new Image();
  return new Promise((resolve, reject) => {
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * scale; c.height = h * scale;
      const x = c.getContext('2d'); x.scale(scale, scale); x.drawImage(img, 0, 0, w, h);
      c.toBlob(b => { save(`${slug(name)}.png`, b); resolve(); }, 'image/png');
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  });
}

// Add PNG / SVG buttons to every chart card under `host` that holds an SVG chart.
export function addExportButtons(host, prefix = '') {
  for (const card of host.querySelectorAll('.vcard')) {
    const svg = card.querySelector('svg.vsvg'), head = card.querySelector('.vcard-h');
    if (!svg || !head || head.querySelector('.sd-exp')) continue;
    const title = `${prefix}${head.querySelector('h3')?.textContent || 'chart'}`;
    const mk = (label, fn) => { const b = document.createElement('button'); b.className = 'vtoggle sd-exp'; b.textContent = label; b.title = `Download this chart as ${label}`; b.addEventListener('click', fn); return b; };
    const toggle = head.querySelector('.vtoggle');
    head.insertBefore(mk('PNG', () => downloadPng(svg, title)), toggle);
    head.insertBefore(mk('SVG', () => downloadSvg(svg, title)), toggle);
  }
}
