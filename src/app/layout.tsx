import type { Metadata } from 'next';
import './globals.css';
import { ToastHost } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Onextel Agent Cloud — Meta Business Agent platform',
  description: 'Enterprise control plane for Meta Business Agents on WhatsApp: tenants, numbers, knowledge, skills, connectors, evaluation and rollout.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('mba_theme');document.documentElement.dataset.theme=(t==='dark'?'dark':'light');}catch(e){document.documentElement.dataset.theme='light';}})();`,
          }}
        />
      </head>
      <body><ToastHost>{children}</ToastHost></body>
    </html>
  );
}
