import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getFriendlyErrorMessage(err: any): string {
  if (!err) return 'An unexpected error occurred. Please try again.';

  const rawMsg = (
    typeof err === 'string' 
      ? err 
      : err.message || err.details || err.error_description || err.hint || ''
  ).toLowerCase();
  const code = String(err.code || '');

  // 1. Unique constraint / Already exists (PostgreSQL 23505)
  if (code === '23505' || rawMsg.includes('unique constraint') || rawMsg.includes('already exists') || rawMsg.includes('duplicate key')) {
    if (rawMsg.includes('phone') || rawMsg.includes('agents_phone_key')) {
      return 'An agent with this phone number already exists.';
    }
    if (rawMsg.includes('vin') || rawMsg.includes('puid') || rawMsg.includes('voters_vin_key')) {
      return 'A voter with this VIN already exists.';
    }
    return 'A record with this information already exists.';
  }

  // 2. Row Level Security (RLS) / Permission Denied (PostgreSQL 42501)
  if (
    code === '42501' || 
    rawMsg.includes('row-level security') || 
    rawMsg.includes('row level security') || 
    rawMsg.includes('violates rls') || 
    rawMsg.includes('permission denied') ||
    rawMsg.includes('violates row-level security policy')
  ) {
    return 'Permission denied: You do not have authorization to perform this action for this jurisdiction.';
  }

  // 3. Password / Authentication errors
  if (rawMsg.includes('incorrect password') || rawMsg.includes('invalid credentials') || rawMsg.includes('invalid login credentials') || rawMsg.includes('wrong password')) {
    return 'Incorrect password. Please try again.';
  }
  if (rawMsg.includes('agent not found') || rawMsg.includes('user not found') || rawMsg.includes('check your phone number') || rawMsg.includes('phone not registered')) {
    return 'Phone number not registered. Please check and try again.';
  }

  // 4. Foreign key constraint / Location mismatch (PostgreSQL 23503)
  if (code === '23503' || rawMsg.includes('foreign key constraint')) {
    return 'The selected jurisdiction or location is invalid.';
  }

  // 5. Network / Connection errors
  if (rawMsg.includes('failed to fetch') || rawMsg.includes('network error') || rawMsg.includes('networkrequestfailed') || rawMsg.includes('timeout')) {
    return 'Network connection error. Please check your internet connection.';
  }

  // 6. Filter out raw system / database error messages
  const isTechnical = /rls|sql|postgres|column|relation|pgrst|violates|supabase|schema|function|constraint|table "|\(\w+\)=\(/i.test(rawMsg);
  if (!isTechnical && typeof err.message === 'string' && err.message.length > 0 && err.message.length < 150) {
    return err.message;
  }

  return 'Unable to complete operation. Please check your details and try again.';
}
