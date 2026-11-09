import type { Metadata } from 'next';
import { ServiceWorkerRegister } from './components/service-worker-register';
import './styles.css';

export const metadata: Metadata = {
  title: 'Nobug Rewards Admin | Gestão de parceiros',
  description: 'Área administrativa da plataforma Nobug Rewards.',
  applicationName: 'Nobug Rewards Admin',
  robots: { index: false, follow: false },
  icons: {
    icon: '/brand/rewards.webp',
    apple: '/brand/rewards.webp',
  },
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt"><body>{children}<ServiceWorkerRegister /></body></html>;
}
