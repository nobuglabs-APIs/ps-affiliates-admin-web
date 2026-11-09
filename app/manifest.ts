import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nobug Rewards Admin',
    short_name: 'Rewards Admin',
    description: 'Administração de recompensas e do ecossistema de parceiros.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f7f9',
    theme_color: '#102844',
    icons: [{ src: '/brand/rewards.webp', sizes: 'any', type: 'image/webp' }],
  };
}
