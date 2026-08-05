/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f3f0e9',
        surface: '#faf8f3',
        'surface-muted': '#ebe7de',
        ink: {
          DEFAULT: '#182126',
          soft: '#4f5b59',
        },
        muted: '#727a76',
        line: '#d7d1c5',
        // 修仙主题色
        jade: {
          DEFAULT: '#3d8b6e',
          soft: '#d4ece1',
        },
        gold: {
          DEFAULT: '#c49b3f',
          soft: '#faf0d7',
        },
        danger: '#a3564f',
        divine: '#7b5ea7',
      },
      fontFamily: {
        display: [
          '"Noto Serif SC"', '"Source Han Serif SC"',
          '"Songti SC"', 'STSong', 'serif',
        ],
        ui: [
          'Inter', '"Noto Sans SC"', '"Microsoft YaHei"',
          'system-ui', 'sans-serif',
        ],
      },
      maxWidth: {
        content: '56rem',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
      },
      boxShadow: {
        surface: '0 1px 3px rgba(24, 33, 38, 0.06)',
        drawer: '0 4px 24px rgba(24, 33, 38, 0.10)',
        dialog: '0 8px 40px rgba(24, 33, 38, 0.14)',
      },
    },
  },
  plugins: [],
};
