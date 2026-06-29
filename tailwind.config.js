/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // カラートークンは src/index.css の CSS 変数（テーマ）を参照する。
        // <alpha-value> により bg-panel/20 のような透過指定も機能する。
        panel: {
          DEFAULT: 'rgb(var(--color-panel) / <alpha-value>)',
          light: 'rgb(var(--color-panel-light) / <alpha-value>)',
          border: 'rgb(var(--color-panel-border) / <alpha-value>)',
        },
        fg: 'rgb(var(--color-fg) / <alpha-value>)',
        risk: {
          safe: 'rgb(var(--color-risk-safe) / <alpha-value>)', // 低リスク
          warn: 'rgb(var(--color-risk-warn) / <alpha-value>)', // 中リスク
          danger: 'rgb(var(--color-risk-danger) / <alpha-value>)', // 高リスク（決壊）
          critical: 'rgb(var(--color-risk-critical) / <alpha-value>)', // 危機
        },
      },
      fontFamily: {
        sans: ['"Hiragino Kaku Gothic ProN"', '"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
