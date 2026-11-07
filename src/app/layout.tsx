import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Baloo_Da_2, Hind_Siliguri } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const baloo = Baloo_Da_2({ subsets: ['bengali', 'latin'], weight: ['600', '700', '800'], variable: '--font-baloo', display: 'swap' });
const hind = Hind_Siliguri({ subsets: ['bengali', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-hind', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'chaJoy loyality', template: '%s · chaJoy loyality' },
  description: 'Digital loyalty stamp card for ChaJoy ice cream and tea.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#97C334' },
    { media: '(prefers-color-scheme: dark)', color: '#171717' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const lang = store.get('chajoy-lang')?.value === 'bn' ? 'bn' : 'en';
  const theme = store.get('chajoy-theme')?.value === 'dark' ? 'dark' : 'light';

  return (
    <html lang={lang} className={`${theme === 'dark' ? 'dark ' : ''}${baloo.variable} ${hind.variable}`}>
      <body>
        <Providers lang={lang} theme={theme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
