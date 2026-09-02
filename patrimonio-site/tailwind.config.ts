import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#101817',
        surface: '#FFFFFF',
        'surface-2': '#F1F5F4',
        border: '#D3DCDA',
        muted: '#52625F',
        accent: {
          DEFAULT: '#0E7C86',
          strong: '#0B5F67',
          soft: '#DCEEEF'
        },
        ok: '#1E8E5A',
        warn: '#9C6A16',
        danger: '#AE3A3A'
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)']
      },
      borderRadius: {
        lg2: '20px',
        md2: '14px'
      }
    }
  },
  plugins: []
};

export default config;
