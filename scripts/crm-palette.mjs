// Paleta do CRM Lembretes (docs/DESIGN-SYSTEM.md). Lida por tailwind.config.js e
// por scripts/gen-crm-theme.mjs. Só vale dentro de html.crm-theme.

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

// Escalas do Tailwind que o CRM substitui (todas viram variável CSS).
export const FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'blue', 'indigo', 'sky',
  'green', 'emerald',
  'red', 'rose',
  'amber', 'yellow',
  'violet', 'purple',
];

export const CRM_SCALE_OF = {
  slate: 'neutral', gray: 'neutral', zinc: 'neutral', neutral: 'neutral', stone: 'neutral',
  blue: 'brand', indigo: 'brand', sky: 'brand',
  green: 'green', emerald: 'green',
  red: 'red', rose: 'red',
  amber: 'amber', yellow: 'amber',
  violet: 'violet', purple: 'violet',
};

export const CRM_SCALES = {
  // Neutro único (matiz da marca, croma baixo). 500+ passa 4.5:1 sobre branco.
  neutral: { 50: '#F7F8FA', 100: '#EFF1F5', 200: '#E2E6EC', 300: '#CDD3DC', 400: '#7D879A', 500: '#636D82', 600: '#4B5468', 700: '#384154', 800: '#252C3B', 900: '#161C28', 950: '#0D1119' },
  // Azul Sal Vita (#0C3680 é o 700).
  brand: { 50: '#F1F4FB', 100: '#E2E9F7', 200: '#C6D3EE', 300: '#9DB3E0', 400: '#6B8BCB', 500: '#3F66B4', 600: '#1F4C9E', 700: '#0C3680', 800: '#0A2C68', 900: '#081F47', 950: '#051430' },
  green: { 50: '#EEF7F1', 100: '#D7EEDF', 200: '#AEDCBD', 300: '#7EC498', 400: '#4FA873', 500: '#2F8C57', 600: '#237548', 700: '#1C5E3A', 800: '#174B2F', 900: '#123B25', 950: '#0A2416' },
  red: { 50: '#FCF2F1', 100: '#F9E1DF', 200: '#F2C2BD', 300: '#E79991', 400: '#D86B61', 500: '#C6483D', 600: '#AE3429', 700: '#902920', 800: '#75231C', 900: '#5F1E18', 950: '#360E0B' },
  amber: { 50: '#FDF7EC', 100: '#FAEBCC', 200: '#F4D596', 300: '#EDBB5C', 400: '#E3A233', 500: '#C98516', 600: '#A96A0F', 700: '#8A5310', 800: '#704314', 900: '#5C3813', 950: '#341D06' },
  violet: { 50: '#F5F3FC', 100: '#EBE6F8', 200: '#D6CCF0', 300: '#B7A6E3', 400: '#957BD2', 500: '#7A5BC0', 600: '#6646A6', 700: '#543A88', 800: '#45316F', 900: '#392A5A', 950: '#231838' },
};
