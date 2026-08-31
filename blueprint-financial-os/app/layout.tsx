import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'Blueprint Financial OS',
  description:
    'Interactive financial modelling and presentation platform for Blueprint Finance strategy sessions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NZ">
      <body className={`${inter.variable} ${grotesk.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
