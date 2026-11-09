'use client';

import { FormEvent, useEffect, useState } from 'react';
import { SocialLogin } from './components/social-login';
import { get, post, request, SessionChallengeRequiredError } from './lib/api';
import { clearTokens, hasTokens, readRefreshToken, saveTokens } from './lib/session';
import type { AdminOverview, AffiliateOverview, AuthResponse, Challenge, Page, Payout } from './lib/types';

type Action = 'approve' | 'paid' | 'reject';
type SelectedAction = { payout: Payout; action: Action };

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('pt-AO', { style: 'currency', currency }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-AO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function payoutDestination(payout: Payout) {
  const destination = payout.destination || {};
  const entries: [string, unknown][] = payout.method === 'bank_transfer'
    ? [['IBAN', destination.iban], ['Banco', destination.bank_name], ['Titular', destination.account_holder]]
    : [['Telemóvel', destination.phone], ['Titular', destination.account_holder]];
  return entries.filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { requested: 'Por analisar', processing: 'Em processamento', paid: 'Pago', rejected: 'Rejeitado' };
  return labels[status] || status;
}

function methodLabel(method: string) {
  const labels: Record<string, string> = {
    bank_transfer: 'Transferência bancária',
    multicaixa_express: 'Multicaixa Express',
    unitel_money: 'Unitel Money',
  };
  return labels[method] || method.replaceAll('_', ' ');
}

export default function AffiliatesAdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [user, setUser] = useState<AffiliateOverview['profile'] | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [socialError, setSocialError] = useState('');
  const [selected, setSelected] = useState<SelectedAction | null>(null);
  const [providerRef, setProviderRef] = useState('');
  const [note, setNote] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<'summary' | 'payouts'>('summary');

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [moreOpen]);

  const loadAdmin = async () => {
    const affiliate = await get<AffiliateOverview>('/affiliate');
    if (!affiliate.profile.is_admin) {
      clearTokens();
      throw new Error('Esta conta não tem permissões de administração.');
    }
    const [summary, requested, processing] = await Promise.all([
      get<AdminOverview>('/admin/overview'),
      get<Page<Payout>>('/admin/payouts?status=requested&per_page=50'),
      get<Page<Payout>>('/admin/payouts?status=processing&per_page=50'),
    ]);
    setUser(affiliate.profile);
    setOverview(summary);
    setPayouts([...requested.items, ...processing.items]);
    setAuthenticated(true);
  };

  useEffect(() => {
    if (!hasTokens()) {
      setChecking(false);
      return;
    }
    void loadAdmin()
      .catch((reason: unknown) => {
        clearTokens();
        if (reason instanceof SessionChallengeRequiredError) setChallenge(reason.challenge);
        else setError(reason instanceof Error ? reason.message : 'Não foi possível validar a sessão.');
      })
      .finally(() => setChecking(false));
  }, []);

  const run = async (action: () => Promise<void>) => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      if (reason instanceof SessionChallengeRequiredError) {
        setAuthenticated(false);
        setChallenge(reason.challenge);
      } else {
        setError(reason instanceof Error ? reason.message : 'Não foi possível concluir o pedido.');
      }
    } finally {
      setBusy(false);
    }
  };

  const acceptTokens = async (auth: AuthResponse) => {
    saveTokens(auth.tokens);
    try {
      await loadAdmin();
      setChallenge(null);
      setCode('');
      setPassword('');
    } catch (reason) {
      clearTokens();
      throw reason;
    }
  };

  const signIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      const result = await post<AuthResponse | Challenge>('/auth/login', { email, password }, false);
      if ('challenge_id' in result) {
        setChallenge(result);
        setMessage(`Código enviado por ${result.channel === 'email' ? 'e-mail' : 'SMS'}.`);
        return;
      }
      await acceptTokens(result);
    });
  };

  const socialSignIn = (provider: 'google' | 'facebook', token: string) => {
    void run(async () => {
      const body = provider === 'google'
        ? { id_token: token, login_only: true }
        : { access_token: token, login_only: true };
      const result = await post<AuthResponse | Challenge>(`/auth/${provider}`, body, false);
      if ('challenge_id' in result) {
        setChallenge(result);
        setMessage(`Código enviado por ${result.channel === 'email' ? 'e-mail' : 'SMS'}.`);
        return;
      }
      await acceptTokens(result);
    });
  };

  const verifyChallenge = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!challenge) return;
    void run(async () => {
      const result = await post<AuthResponse>('/auth/login/verify', { challenge_id: challenge.challenge_id, code }, false);
      await acceptTokens(result);
    });
  };

  const signOut = () => run(async () => {
    const refreshToken = readRefreshToken();
    try {
      if (refreshToken) await request('/auth/logout', { method: 'POST', body: { refresh_token: refreshToken }, retry: false });
    } finally {
      clearTokens();
      setAuthenticated(false);
      setUser(null);
      setOverview(null);
      setPayouts([]);
    }
  });

  const submitAction = () => {
    if (!selected) return;
    void run(async () => {
      const { payout, action } = selected;
      if (action === 'approve') {
        await post(`/admin/payouts/${encodeURIComponent(payout.id)}/approve`);
      } else if (action === 'paid') {
        await post(`/admin/payouts/${encodeURIComponent(payout.id)}/mark-paid`, {
          provider_ref: providerRef.trim() || null,
          note: note.trim() || null,
        });
      } else {
        await post(`/admin/payouts/${encodeURIComponent(payout.id)}/reject`, { reason: note.trim() || null });
      }
      setSelected(null);
      setProviderRef('');
      setNote('');
      await loadAdmin();
      setMessage(action === 'approve' ? 'Levantamento aprovado e enviado para processamento.' : action === 'paid' ? 'Levantamento marcado como pago.' : 'Levantamento rejeitado.');
    });
  };

  if (checking) return <main className="loading-screen"><img className="brand-mark" src="/brand/rewards.webp" alt="Nobug Rewards" /><p>A validar acesso seguro…</p></main>;

  if (!authenticated) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <a className="brand-lockup" href="/" aria-label="Nobug Rewards Admin"><img alt="" src="/brand/rewards.webp" /><span>Nobug Rewards<small>ADMINISTRAÇÃO</small></span></a>
          <p>Recompensas e ecossistema de parceiros</p>
          <span className="eyebrow">ÁREA RESTRITA</span>
          <h1>{challenge ? 'Confirme a sua identidade' : 'Gestão do programa'}</h1>
          <p>{challenge ? `Introduza o código enviado por ${challenge.channel === 'email' ? 'e-mail' : 'SMS'}.` : 'Inicie sessão com uma conta autorizada para administrar o programa de afiliados.'}</p>
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          {message && <p className="notice notice-success" role="status">{message}</p>}
          {socialError && <p className="notice notice-error" role="alert">{socialError}</p>}
          {challenge ? (
            <form onSubmit={verifyChallenge}>
              <label htmlFor="admin-code">Código de segurança</label>
              <input id="admin-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
              <button className="primary-button" disabled={busy}>{busy ? 'A confirmar…' : 'Confirmar código'}</button>
              <button className="text-button" onClick={() => { setChallenge(null); setMessage(''); }} type="button">Voltar ao início de sessão</button>
            </form>
          ) : (
            <>
              <form onSubmit={signIn}>
                <label htmlFor="admin-email">E-mail</label>
                <input id="admin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
                <label htmlFor="admin-password">Palavra-passe</label>
                <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                <button className="primary-button" disabled={busy}>{busy ? 'A validar…' : 'Entrar'}</button>
              </form>
              <SocialLogin disabled={busy} onToken={socialSignIn} onError={setSocialError} />
            </>
          )}
          <small>O acesso administrativo é verificado pela API em cada operação.</small>
        </section>
      </main>
    );
  }

  const requestedCount = payouts.filter((payout) => payout.status === 'requested').length;
  const processingCount = payouts.filter((payout) => payout.status === 'processing').length;

  return (
    <main className="admin-shell">
      <header className="topbar">
        <a className="brand-lockup" href="/" aria-label="Nobug Rewards Admin"><img alt="" src="/brand/rewards.webp" /><span>Nobug Rewards<small>ADMIN</small></span></a>
        <span className="admin-indicator"><i /> Administração</span>
        <div className="topbar-spacer" />
        <span className="user-name">{user?.full_name}</span>
        <button className="signout-button" onClick={() => void signOut()} type="button">Terminar sessão</button>
      </header>
      <section className="content">
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {message && <p className="notice notice-success" role="status">{message}</p>}
        {busy && <p className="loading-line" role="status">A actualizar os dados…</p>}
        <header className="page-heading">
          <div><span className="eyebrow">GESTÃO INTERNA</span><h1>Pagamentos de afiliados</h1><p>Analise os pedidos e registe o resultado do processamento.</p></div>
        </header>
        <section className="metrics" id="admin-summary" aria-label="Resumo">
          <article><span>Afiliados</span><strong>{overview?.affiliates_count ?? 0}</strong></article>
          <article><span>Por analisar</span><strong>{requestedCount}</strong></article>
          <article><span>Em processamento</span><strong>{processingCount}</strong></article>
          <article><span>Total pendente</span><strong>{formatMoney(overview?.pending_payouts_cents ?? 0, overview?.currency ?? 'AOA')}</strong></article>
        </section>
        <section className="payouts" id="admin-payouts">
          <div className="section-heading"><div><h2>Pedidos de levantamento</h2><p>Os destinos de pagamento são visíveis apenas a administradores.</p></div><span>{payouts.length} pendente(s)</span></div>
          {payouts.length === 0 ? <div className="empty-state"><strong>Não há pedidos pendentes</strong><p>Os novos pedidos serão apresentados aqui.</p></div> : (
            <div className="payout-list">
              {payouts.map((payout) => (
                <article className="payout-card" key={payout.id}>
                  <div className="payout-card-heading">
                    <div><strong>{payout.affiliate_email || payout.affiliate_code}</strong><span>{payout.affiliate_code} · {formatDate(payout.requested_at)}</span></div>
                    <div className="payout-value"><strong>{formatMoney(payout.amount_cents, payout.currency)}</strong><span className={`status status-${payout.status}`}>{statusLabel(payout.status)}</span></div>
                  </div>
                  <dl className="destination">
                    <div><dt>Método</dt><dd>{methodLabel(payout.method)}</dd></div>
                    {payoutDestination(payout).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                  </dl>
                  <div className="action-group">
                    {payout.status === 'requested' && <button className="button button-primary" disabled={busy} onClick={() => setSelected({ payout, action: 'approve' })} type="button">Aprovar</button>}
                    <button className="button button-outline" disabled={busy} onClick={() => setSelected({ payout, action: 'paid' })} type="button">Marcar pago</button>
                    <button className="button button-danger" disabled={busy} onClick={() => setSelected({ payout, action: 'reject' })} type="button">Rejeitar</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
      {selected && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }} role="presentation">
          <section aria-labelledby="dialog-title" aria-modal="true" className="dialog" role="dialog">
            <button aria-label="Fechar" className="dialog-close" onClick={() => setSelected(null)} type="button">×</button>
            <span className="eyebrow">CONFIRMAR ACÇÃO</span>
            <h2 id="dialog-title">{selected.action === 'approve' ? 'Aprovar pedido' : selected.action === 'paid' ? 'Registar pagamento' : 'Rejeitar pedido'}</h2>
            <p>{formatMoney(selected.payout.amount_cents, selected.payout.currency)} · {selected.payout.affiliate_email || selected.payout.affiliate_code}</p>
            {selected.action === 'paid' && <><label htmlFor="provider-ref">Referência de pagamento <span>(opcional)</span></label><input id="provider-ref" maxLength={200} value={providerRef} onChange={(event) => setProviderRef(event.target.value)} /></>}
            {selected.action !== 'approve' && <><label htmlFor="action-note">{selected.action === 'reject' ? 'Motivo da rejeição' : 'Nota interna'} <span>(opcional)</span></label><textarea id="action-note" maxLength={500} rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></>}
            <div className="dialog-actions">
              <button className="button button-outline" onClick={() => setSelected(null)} type="button">Cancelar</button>
              <button className={`button ${selected.action === 'reject' ? 'button-danger' : 'button-primary'}`} disabled={busy} onClick={submitAction} type="button">{busy ? 'A guardar…' : 'Confirmar'}</button>
            </div>
          </section>
        </div>
      )}
      <nav className="mobile-nav" aria-label="Navegação do painel">
        <button aria-current={mobileSection === 'summary' ? 'page' : undefined} className={`mobile-nav__item${mobileSection === 'summary' ? ' mobile-nav__item--active' : ''}`} onClick={() => { setMobileSection('summary'); document.getElementById('admin-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" /></svg>
          <span>Resumo</span>
        </button>
        <button aria-current={mobileSection === 'payouts' ? 'page' : undefined} className={`mobile-nav__item${mobileSection === 'payouts' ? ' mobile-nav__item--active' : ''}`} onClick={() => { setMobileSection('payouts'); document.getElementById('admin-payouts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /><path d="M7 6V4h10v2" /></svg>
          <span>Pedidos</span>
        </button>
        <button aria-controls="admin-mobile-more" aria-expanded={moreOpen} className={`mobile-nav__item${moreOpen ? ' mobile-nav__item--active' : ''}`} onClick={() => setMoreOpen((open) => !open)} type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
          <span>Mais</span>
        </button>
      </nav>
      {moreOpen && (
        <div className="mobile-more-overlay">
          <button aria-label="Fechar menu" className="mobile-more-dismiss" onClick={() => setMoreOpen(false)} type="button" />
          <section aria-label="Conta administrativa" className="mobile-more-panel" id="admin-mobile-more">
            <div className="mobile-more-account">
              <span className="mobile-more-avatar">{user?.full_name.slice(0, 1).toUpperCase() || 'A'}</span>
              <span className="mobile-more-user">{user?.full_name}</span>
              <span className="mobile-admin-label">Admin</span>
            </div>
            <button className="mobile-more-logout" disabled={busy} onClick={() => { setMoreOpen(false); void signOut(); }} type="button">Terminar sessão</button>
          </section>
        </div>
      )}
    </main>
  );
}
