'use client';

import { useEffect, useRef } from 'react';

type GoogleResponse = { credential?: string };
type FacebookResponse = { authResponse?: { accessToken?: string } };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: GoogleResponse) => void }) => void;
          renderButton: (element: HTMLElement, options: { theme: string; size: string; text: string; shape: string; width: number }) => void;
        };
      };
    };
    FB?: {
      init: (options: { appId: string; xfbml: boolean; version: string }) => void;
      login: (callback: (response: FacebookResponse) => void, options: { scope: string }) => void;
    };
  }
}

function loadScript(id: string, src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }
    const script = existing || document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('Não foi possível carregar o serviço de autenticação.'));
    };
    if (!existing) document.head.appendChild(script);
  });
}

export function SocialLogin({
  disabled,
  onToken,
  onError,
}: {
  disabled: boolean;
  onToken: (provider: 'google' | 'facebook', token: string) => void;
  onError: (message: string) => void;
}) {
  const googleButton = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  const facebookAppId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID?.trim();

  useEffect(() => {
    if (!googleClientId || !googleButton.current) return;
    void loadScript('google-identity-services', 'https://accounts.google.com/gsi/client')
      .then(() => {
        if (!window.google || !googleButton.current) throw new Error('O serviço Google não ficou disponível.');
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response) => response.credential
            ? callbacks.current.onToken('google', response.credential)
            : callbacks.current.onError('O Google não devolveu um token de acesso.'),
        });
        window.google.accounts.id.renderButton(googleButton.current, {
          theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular',
          width: Math.min(360, Math.max(220, googleButton.current.clientWidth)),
        });
      })
      .catch((reason: unknown) => callbacks.current.onError(reason instanceof Error ? reason.message : 'Falha ao iniciar o Google.'));
  }, [googleClientId]);

  useEffect(() => {
    if (!facebookAppId) return;
    void loadScript('facebook-jssdk', 'https://connect.facebook.net/en_US/sdk.js')
      .then(() => {
        if (!window.FB) throw new Error('O serviço Facebook não ficou disponível.');
        window.FB.init({ appId: facebookAppId, xfbml: false, version: 'v22.0' });
      })
      .catch((reason: unknown) => callbacks.current.onError(reason instanceof Error ? reason.message : 'Falha ao iniciar o Facebook.'));
  }, [facebookAppId]);

  if (!googleClientId && !facebookAppId) return null;

  const loginFacebook = () => {
    if (!window.FB) {
      callbacks.current.onError('O acesso com Facebook ainda está a carregar. Tente novamente.');
      return;
    }
    window.FB.login((response) => {
      const token = response.authResponse?.accessToken;
      if (token) callbacks.current.onToken('facebook', token);
      else callbacks.current.onError('O acesso com Facebook foi cancelado ou não foi autorizado.');
    }, { scope: 'email' });
  };

  return (
    <div aria-busy={disabled} className="social-login">
      <div className="social-divider"><span>ou continuar com</span></div>
      {googleClientId && <div ref={googleButton} className="social-google" aria-label="Continuar com Google" />}
      {facebookAppId && <button className="facebook-button" disabled={disabled} onClick={loginFacebook} type="button"><strong aria-hidden="true">f</strong> Continuar com Facebook</button>}
    </div>
  );
}
