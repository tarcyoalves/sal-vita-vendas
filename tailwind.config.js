/**
 * Design system do CRM — ver docs/DESIGN-SYSTEM.md.
 *
 * As escalas de cor abaixo SUBSTITUEM as do Tailwind de propósito: o código tem
 * ~2.500 usos de slate/gray/blue/emerald/red escritos ao longo de meses por
 * vários agentes. Remapear a escala faz todos falarem a mesma língua sem tocar
 * em cada arquivo: um único cinza (levemente puxado para o azul da marca), um
 * único azul (o da Sal Vita), um verde, um vermelho, um âmbar.
 */

// Neutro único (matiz da marca, croma baixo). 500+ passa 4.5:1 sobre branco.
const neutral = {
  50: '#F7F8FA',
  100: '#EFF1F5',
  200: '#E2E6EC',
  300: '#CDD3DC',
  400: '#7D879A',
  500: '#636D82',
  600: '#4B5468',
  700: '#384154',
  800: '#252C3B',
  900: '#161C28',
  950: '#0D1119',
};

// Azul Sal Vita (#0C3680 é o 700).
const brand = {
  50: '#F1F4FB',
  100: '#E2E9F7',
  200: '#C6D3EE',
  300: '#9DB3E0',
  400: '#6B8BCB',
  500: '#3F66B4',
  600: '#1F4C9E',
  700: '#0C3680',
  800: '#0A2C68',
  900: '#081F47',
  950: '#051430',
};

const green = {
  50: '#EEF7F1',
  100: '#D7EEDF',
  200: '#AEDCBD',
  300: '#7EC498',
  400: '#4FA873',
  500: '#2F8C57',
  600: '#237548',
  700: '#1C5E3A',
  800: '#174B2F',
  900: '#123B25',
  950: '#0A2416',
};

const red = {
  50: '#FCF2F1',
  100: '#F9E1DF',
  200: '#F2C2BD',
  300: '#E79991',
  400: '#D86B61',
  500: '#C6483D',
  600: '#AE3429',
  700: '#902920',
  800: '#75231C',
  900: '#5F1E18',
  950: '#360E0B',
};

const amber = {
  50: '#FDF7EC',
  100: '#FAEBCC',
  200: '#F4D596',
  300: '#EDBB5C',
  400: '#E3A233',
  500: '#C98516',
  600: '#A96A0F',
  700: '#8A5310',
  800: '#704314',
  900: '#5C3813',
  950: '#341D06',
};

const violet = {
  50: '#F5F3FC',
  100: '#EBE6F8',
  200: '#D6CCF0',
  300: '#B7A6E3',
  400: '#957BD2',
  500: '#7A5BC0',
  600: '#6646A6',
  700: '#543A88',
  800: '#45316F',
  900: '#392A5A',
  950: '#231838',
};

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './client/index.html',
    './client/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        cond: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        script: ['Pacifico', 'cursive'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        // Controles 6px, painéis 8px. As classes "grandes" herdadas foram domadas
        // aqui para o CRM parar de parecer bolha.
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '8px',
        xl: '10px',
        '2xl': '12px',
        '3xl': '14px',
      },
      boxShadow: {
        // Sombra só para o que flutua (menus, popovers, diálogos). Painel usa borda.
        xs: '0 1px 1px 0 rgb(22 28 40 / 0.04)',
        sm: '0 1px 2px 0 rgb(22 28 40 / 0.05)',
        DEFAULT: '0 1px 3px 0 rgb(22 28 40 / 0.07)',
        md: '0 2px 8px -2px rgb(22 28 40 / 0.10)',
        lg: '0 8px 24px -8px rgb(22 28 40 / 0.16)',
        xl: '0 16px 40px -12px rgb(22 28 40 / 0.22)',
        '2xl': '0 24px 56px -16px rgb(22 28 40 / 0.28)',
      },
      colors: {
        slate: neutral,
        gray: neutral,
        zinc: neutral,
        neutral,
        stone: neutral,
        blue: brand,
        indigo: brand,
        sky: brand,
        green,
        emerald: green,
        red,
        rose: red,
        amber,
        yellow: amber,
        violet,
        purple: violet,
        brand: {
          ...brand,
          DEFAULT: 'var(--brand)',
          deep: 'var(--brand-deep)',
          soft: 'var(--brand-soft)',
        },
        salt: 'var(--salt)',
        sand: {
          DEFAULT: 'var(--sand)',
          soft: 'var(--sand-soft)',
        },
        ink: 'var(--ink)',
        surface: {
          DEFAULT: 'var(--surface)',
          sunken: 'var(--surface-sunken)',
        },
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        info: { DEFAULT: 'var(--info)', soft: 'var(--info-soft)' },
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
    },
  },
  plugins: [],
};
