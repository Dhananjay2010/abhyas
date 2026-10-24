/**
 * Core logic for loading a history page with pagination.
 * 
 * Fetches session IDs and total count from get_history_page RPC.
 * Handles page validation and clamping for invalid or beyond-range params.
 * 
 * @param supabase - Supabase client (authenticated)
 * @param options - userId, filter, today, limit, pageParam
 * @returns Promise with sessionIds, totalCount, page, totalPages, and optional redirectTo on error
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePageParam } from "./parse-page-param";

export interface LoadHistoryPageOptions {
  userId: string;
  filter: string;
  today: string;
  limit: number;
  pageParam: string | undefined;
}

export interface LoadHistoryPageResult {
  sessionIds: string[];
  totalCount: number;
  page: number;
  totalPages: number;
  redirectTo?: string;
  error?: string;
}

type PageRow = { session_id: string | null; total_count: number };

export async function loadHistoryPage(
  supabase: SupabaseClient,
  options: LoadHistoryPageOptions
): Promise<LoadHistoryPageResult> {
  const { userId, filter, today, limit, pageParam } = options;

  // First, get total count with a zero-offset query to determine totalPages
  const { data: countData, error: countError } = await supabase.rpc("get_history_page", {
    p_user: userId,
    p_filter: filter,
    p_today: today,
    p_limit: limit,
    p_offset: 0,
  });

  if (countError) {
    return {
      sessionIds: [],
      totalCount: 0,
      page: 1,
      totalPages: 0,
      error: countError.message,
    };
  }

  const countRows = (countData ?? []) as unknown as PageRow[];
  const totalCount = countRows.length > 0 ? Number(countRows[0].total_count) : 0;
  const totalPages = Math.ceil(totalCount / limit);

  // Parse and validate page param
  const page = parsePageParam(pageParam, totalPages);
  const offset = (page - 1) * limit;

  // If page is 1 and we already have the data, use it
  if (page === 1) {
    const sessionIds = countRows
      .map((r) => r.session_id)
      .filter((id): id is string => id !== null);

    return {
      sessionIds,
      totalCount,
      page,
      totalPages,
    };
  }

  // Otherwise, fetch with the correct offset
  const { data: pageData, error: pageError } = await supabase.rpc("get_history_page", {
    p_user: userId,
    p_filter: filter,
    p_today: today,
    p_limit: limit,
    p_offset: offset,
  });

  if (pageError) {
    return {
      sessionIds: [],
      totalCount,
      page,
      totalPages,
      error: pageError.message,
    };
  }

  const pageRows = (pageData ?? []) as unknown as PageRow[];
  const sessionIds = pageRows
    .map((r) => r.session_id)
    .filter((id): id is string => id !== null);

  return {
    sessionIds,
    totalCount,
    page,
    totalPages,
  };
}
