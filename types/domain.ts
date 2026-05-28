/**
 * Domain types: shapes built up by the services layer from one or more DB rows.
 * Components and templates should consume these, never raw DB rows directly.
 */

import type { ProfileRow, QrCodeRow, QrScanRow, UserRole } from "./database";

export type { ProfileRow, QrCodeRow, QrScanRow, UserRole };

export interface CurrentUser {
  userId: string;
  email: string | null;
  profile: ProfileRow;
  role: UserRole;
}

export interface QrCodeWithStats extends QrCodeRow {
  scan_count: number;
}

export interface DailyScanPoint {
  day: string; // YYYY-MM-DD
  count: number;
}

export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export interface CreateQrCodeInput {
  name: string;
  destinationUrl: string;
  utm: UtmParams;
  customSlug?: string;
}
