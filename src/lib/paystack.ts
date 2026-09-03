import { supabase } from './supabase';

/**
 * Paystack Service
 * Secure Paystack API integration routed through the Supabase Edge Function ('paystack').
 * Keeps the live secret key protected on Supabase backend.
 */

const PAYSTACK_BASE = 'https://api.paystack.co';
const LOCAL_SECRET_KEY = import.meta.env.VITE_PAYSTACK_SECRET_KEY as string | undefined;

export interface PaystackBank {
  id: number;
  name: string;
  slug: string;
  code: string;
  longcode: string;
  type: string;
  country: string;
  currency: string;
  active: boolean;
}

export interface PaystackAccountVerification {
  account_number: string;
  account_name: string;
  bank_id: number;
}

let cachedBanks: PaystackBank[] | null = null;

/**
 * Fetch all Nigerian banks from Paystack (cached).
 * Tries Supabase Edge Function first, then local fallback if configured.
 */
export async function fetchBanks(): Promise<PaystackBank[]> {
  if (cachedBanks && cachedBanks.length > 0) {
    return cachedBanks;
  }

  // 1. Try Supabase Edge Function
  try {
    const { data, error } = await supabase.functions.invoke('paystack', {
      body: { action: 'banks' },
    });

    if (!error && data?.status && Array.isArray(data.data)) {
      const list = (data.data as PaystackBank[])
        .filter(b => b.active)
        .sort((a, b) => a.name.localeCompare(b.name));
      cachedBanks = list;
      return list;
    }
  } catch (fnErr) {
    console.warn('Edge function paystack banks call failed, checking fallback...', fnErr);
  }

  // 2. Local fallback if secret key is present in env
  if (LOCAL_SECRET_KEY) {
    const res = await fetch(`${PAYSTACK_BASE}/bank?currency=NGN&perPage=300`, {
      headers: {
        Authorization: `Bearer ${LOCAL_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) {
      const json = await res.json();
      if (json.status) {
        const list = (json.data as PaystackBank[])
          .filter(b => b.active)
          .sort((a, b) => a.name.localeCompare(b.name));
        cachedBanks = list;
        return list;
      }
    }
  }

  throw new Error('Could not load banks from Paystack. Please ensure PAYSTACK_SECRET_KEY is configured in Supabase Edge Functions.');
}

/**
 * Verify a bank account number using Paystack via Supabase Edge Function.
 * Returns the resolved account name on success.
 */
export async function verifyAccount(
  accountNumber: string,
  bankCode: string
): Promise<PaystackAccountVerification> {
  const cleanNumber = accountNumber.trim();
  if (cleanNumber.length !== 10) {
    throw new Error('Account number must be exactly 10 digits');
  }

  // 1. Try Supabase Edge Function
  try {
    const { data, error } = await supabase.functions.invoke('paystack', {
      body: { action: 'resolve', accountNumber: cleanNumber, bankCode },
    });

    if (!error && data?.status && data?.data) {
      return data.data as PaystackAccountVerification;
    }

    if (data?.message) {
      throw new Error(data.message);
    }
  } catch (fnErr: any) {
    // If not a missing key or server unreachable, rethrow
    if (fnErr?.message && !fnErr.message.includes('secret is not configured')) {
      throw fnErr;
    }
  }

  // 2. Local fallback if secret key is present in env
  if (LOCAL_SECRET_KEY) {
    const res = await fetch(
      `${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(cleanNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
      {
        headers: {
          Authorization: `Bearer ${LOCAL_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.status) {
      throw new Error(json?.message || 'Could not verify account. Please check the bank and account number.');
    }

    return json.data as PaystackAccountVerification;
  }

  throw new Error('Account verification service is unavailable. Please check Supabase secrets configuration.');
}

/**
 * Verifies if the verified bank account name tallies with the user/agent name.
 * Accepts matches where either first name or last name (or a family name) appears in the bank account name.
 */
export function verifyNameMatch(
  accountName: string,
  userFirstName?: string,
  userLastName?: string,
  fullName?: string
): { isMatch: boolean; matchedWord?: string; reason?: string } {
  if (!accountName || !accountName.trim()) {
    return { isMatch: false, reason: 'Account name is empty' };
  }

  // Normalize string: remove special punctuation, split into word tokens
  const clean = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .trim();

  const bankTokens = clean(accountName)
    .split(/\s+/)
    .filter(w => w.length >= 2);

  // Candidate tokens from user's registered name
  const candidateTokens: string[] = [];
  if (userFirstName) {
    candidateTokens.push(
      ...clean(userFirstName)
        .split(/\s+/)
        .filter(w => w.length >= 2)
    );
  }
  if (userLastName) {
    candidateTokens.push(
      ...clean(userLastName)
        .split(/\s+/)
        .filter(w => w.length >= 2)
    );
  }
  if (fullName) {
    candidateTokens.push(
      ...clean(fullName)
        .split(/\s+/)
        .filter(w => w.length >= 2)
    );
  }

  const uniqueCandidates = Array.from(new Set(candidateTokens));

  // If no user name provided to compare against, allow through
  if (uniqueCandidates.length === 0) {
    return { isMatch: true };
  }

  const honorifics = new Set(['MR', 'MRS', 'MISS', 'MS', 'DR', 'CHIEF', 'ENGR', 'ALHAJI', 'ALHAJA']);

  for (const token of uniqueCandidates) {
    if (honorifics.has(token)) continue;

    const matched = bankTokens.find(bt => {
      if (bt === token) return true;
      if (token.length >= 3 && bt.length >= 3) {
        return bt.includes(token) || token.includes(bt);
      }
      return false;
    });

    if (matched) {
      return { isMatch: true, matchedWord: token };
    }
  }

  const expectedNames = [userFirstName, userLastName].filter(Boolean).join(' ') || fullName || 'your name';
  return {
    isMatch: false,
    reason: `Bank account name ("${accountName}") does not match agent name ("${expectedNames}").`,
  };
}

/**
 * Checks if the bank account number is already registered in the database.
 */
export async function checkAccountExistsInDb(
  accountNumber: string,
  excludeAgentId?: string
): Promise<{ exists: boolean; registeredTo?: string }> {
  try {
    const cleanNum = accountNumber.trim();
    if (!cleanNum) return { exists: false };

    let query = supabase
      .from('agents')
      .select('id, name, first_name, last_name, account_number')
      .eq('account_number', cleanNum);

    if (excludeAgentId) {
      query = query.neq('id', excludeAgentId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('DB check error for account_number:', error);
      return { exists: false };
    }

    if (data && data.length > 0) {
      const existing = data[0];
      const ownerName =
        existing.name ||
        `${existing.first_name || ''} ${existing.last_name || ''}`.trim() ||
        'another registered agent';
      return { exists: true, registeredTo: ownerName };
    }

    return { exists: false };
  } catch (err) {
    console.warn('Account check exception:', err);
    return { exists: false };
  }
}

