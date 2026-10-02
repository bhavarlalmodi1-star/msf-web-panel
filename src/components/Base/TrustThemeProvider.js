"use client";
// antd theme for the whole panel, in the colours chosen at
// Settings → Trust Details → Colours.
//
// `themeAntd` (constent/antdTheme.js) is written in the original rose/orange
// colours; recolor() swaps every one of them for the matching shade of the
// chosen colours. With the default colours it is passed through untouched.
import { useMemo } from 'react';
import { ConfigProvider } from 'antd';
import { themeAntd } from '@/constent/antdTheme';
import { useTrust } from '@/utils/trust/useTrust';
import { recolor } from '@/utils/trust/theme';

export default function TrustThemeProvider({ children }) {
  const trust = useTrust();
  const theme = useMemo(() => recolor(themeAntd, trust.theme), [trust.theme]);
  return <ConfigProvider theme={theme}>{children}</ConfigProvider>;
}
