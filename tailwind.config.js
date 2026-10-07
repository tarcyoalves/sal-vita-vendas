/**
 * Tailwind compartilhado por CRM Lembretes e loja Premium.
 *
 * As escalas slate/gray/blue/green/red/amber/... e o raio/sombra/fonte saem de
 * variáveis CSS (client/src/crm-theme.css, gerado por scripts/gen-crm-theme.mjs):
 * - em :root valem os valores ORIGINAIS do Tailwind — a loja não muda;
 * - em html.crm-theme vale a paleta do CRM (docs/DESIGN-SYSTEM.md).
 * App.tsx só liga `crm-theme` no domínio do CRM.
 */
import { FAMILIES, SHADES, CRM_SCALES } from './scripts/crm-palette.mjs';

const varScale = (fam) =>
  Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--tw-${fam}-${s}) / <alpha-value>)`]));

const remapped = Object.fromEntries(FAMILIES.map((fam) => [fam, varScale(fam)]));

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
        sans: 'var(--font-sans)',
        cond: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        script: ['Pacifico', 'cursive'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-default)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-default)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        '2xl': 'var(--shadow-2xl)',
      },
      colors: {
        ...remapped,
        // Escala nova, usada só pelo CRM (não existia antes): valores fixos.
        brand: {
          ...CRM_SCALES.brand,
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
