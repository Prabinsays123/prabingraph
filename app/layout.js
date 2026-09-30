import './globals.css';
export const metadata = { title: 'Plotline — graphing calculator', description: 'A fast, playful graphing calculator.' };
export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, themeColor: '#0b0c10' };
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
