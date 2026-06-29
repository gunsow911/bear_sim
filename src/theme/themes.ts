/**
 * カラーテーマの定義（単一の真実源）。
 * 実際の色は src/index.css の `:root[data-theme='...']` に CSS 変数として持つ。
 * ここでは「選択肢の一覧」と「適用ヘルパ」のみを管理する。
 *
 * テーマを増やす手順:
 *   1) index.css に `:root[data-theme='xxx'] { --color-... }` を追加
 *   2) 下の THEMES に { id: 'xxx', label: '表示名' } を追加
 */

export interface ThemeOption {
  id: string
  label: string
}

export const THEMES: ThemeOption[] = [
  { id: 'command', label: '対策本部（標準）' },
  { id: 'ocean', label: 'オーシャン' },
  { id: 'amber', label: 'アンバー' },
]

export const DEFAULT_THEME = 'command'

/** <html data-theme="..."> を差し替えてテーマを一括適用する。 */
export function applyTheme(id: string): void {
  document.documentElement.setAttribute('data-theme', id)
}
