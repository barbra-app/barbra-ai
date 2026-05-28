/**
 * Database row types.
 *
 * These mirror the SQL schema in supabase/migrations and are used by the services layer
 * to type all reads/writes. Replace by-hand types with `supabase gen types typescript`
 * output when convenient — the structure of the import will not change.
 */

export type UserRole = "client" | "admin";

export interface ProfileRow {
  id: string;
  role: UserRole;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface QrCodeRow {
  id: string;
  owner_id: string;
  name: string;
  destination_url: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  slug: string;
  final_url: string;
  image_url: string | null;
  image_public_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface QrScanRow {
  id: string;
  qr_code_id: string;
  scanned_at: string;
  user_agent: string | null;
  referrer: string | null;
  country: string | null;
}
