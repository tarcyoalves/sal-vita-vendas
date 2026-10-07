// Gera client/src/crm-theme.css — rode `node scripts/gen-crm-theme.mjs` se mudar a paleta.
//
// Por que existe: CRM e loja Premium compartilham o mesmo tailwind.config.js. A
// paleta do CRM (docs/DESIGN-SYSTEM.md) troca as escalas slate/blue/green/... e o
// raio/sombra, mas a loja NÃO pode mudar. Então as escalas viram variáveis CSS:
// em :root ficam os valores originais do Tailwind (a loja continua idêntica) e em
// html.crm-theme ficam os do CRM. App.tsx liga a classe só no domínio do CRM.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { FAMILIES, SHADES, CRM_SCALE_OF, CRM_SCALES } from './crm-palette.mjs';

const require = createRequire(import.meta.url);
const twColors = require('tailwindcss/colors');

const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
};

const root = [];
const crm = [];
for (const fam of FAMILIES) {
  for (const s of SHADES) {
    root.push(`  --tw-${fam}-${s}: ${rgb(twColors[fam][s])};`);
    crm.push(`  --tw-${fam}-${s}: ${rgb(CRM_SCALES[CRM_SCALE_OF[fam]][s])};`);
  }
}

const css = `/* GERADO por scripts/gen-crm-theme.mjs — não edite à mão. */

/* Padrão = Tailwind original (loja Premium e páginas públicas). */
:root {
${root.join('\n')}
  --radius-sm: calc(0.65rem - 4px);
  --radius-default: 0.25rem;
  --radius-md: calc(0.65rem - 2px);
  --radius-lg: 0.65rem;
  --radius-xl: 0.75rem;
  --radius-2xl: 1rem;
  --radius-3xl: 1.5rem;
  --shadow-xs: none;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-default: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
  --font-sans: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
}

/* CRM Lembretes. */
html.crm-theme {
${crm.join('\n')}
  --radius-sm: 4px;
  --radius-default: 6px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 10px;
  --radius-2xl: 12px;
  --radius-3xl: 14px;
  --shadow-xs: 0 1px 1px 0 rgb(22 28 40 / 0.04);
  --shadow-sm: 0 1px 2px 0 rgb(22 28 40 / 0.05);
  --shadow-default: 0 1px 3px 0 rgb(22 28 40 / 0.07);
  --shadow-md: 0 2px 8px -2px rgb(22 28 40 / 0.10);
  --shadow-lg: 0 8px 24px -8px rgb(22 28 40 / 0.16);
  --shadow-xl: 0 16px 40px -12px rgb(22 28 40 / 0.22);
  --shadow-2xl: 0 24px 56px -16px rgb(22 28 40 / 0.28);
  --font-sans: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
`;

writeFileSync(new URL('../client/src/crm-theme.css', import.meta.url), css);
console.log('client/src/crm-theme.css gerado');
