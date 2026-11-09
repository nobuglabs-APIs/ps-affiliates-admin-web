export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type AuthResponse = { tokens: TokenResponse };
export type Challenge = { challenge_id: string; channel: string; expires_in_secs: number };
export type Page<T> = { items: T[]; page: number; per_page: number; total: number };

export type AffiliateOverview = {
  profile: {
    id: string;
    full_name: string;
    email: string | null;
    is_admin: boolean;
  };
};

export type AdminOverview = {
  affiliates_count: number;
  pending_payouts_count: number;
  pending_payouts_cents: number;
  paid_payouts_cents: number;
  currency: string;
};

export type Payout = {
  id: string;
  affiliate_id: string;
  affiliate_code: string;
  affiliate_email: string | null;
  amount_cents: number;
  currency: string;
  method: string;
  destination: Record<string, unknown>;
  status: string;
  provider_ref: string | null;
  note: string | null;
  requested_at: string;
};
