"use server";

import { revalidateTag } from "next/cache";
import { getAuthedClient } from "@/lib/supabase/auth";
import { checkGymOwnership } from "@/lib/gym/owner-check";
import { gymBrandTag } from "@/lib/gym-brand";
import { buildBrandingArgs } from "@/lib/gym/branding-args";
import { isOfflineError } from "@/lib/offline-error";
import { isSessionExpired } from "@/lib/auth/session-expired";
import { isValidHexColor, isValidLogoUrl } from "@/lib/gym/branding-validation";

type BrandingFormData = {
  gymId: string;
  displayName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
};

export type BrandingResult =
  | { success: true }
  | { success: false; error: string; field?: string };

/**
 * Update gym branding settings (owner-only)
 */
export async function updateBranding(
  formData: BrandingFormData,
): Promise<BrandingResult> {
  try {
    const { supabase, user } = await getAuthedClient();
    if (!user) {
      return { success: false, error: "Please sign in to continue" };
    }

    const ownership = await checkGymOwnership(supabase, user.id);
    if (!ownership.isOwner || ownership.gymId !== formData.gymId) {
      return { success: false, error: "Only the gym owner can update branding" };
    }

    // Validate inputs client-side for better UX
    if (formData.primaryColor && !isValidHexColor(formData.primaryColor)) {
      return {
        success: false,
        error: "Primary color must be a 6-digit hex code (e.g. #FF9A2E)",
        field: "primaryColor",
      };
    }

    if (formData.accentColor && !isValidHexColor(formData.accentColor)) {
      return {
        success: false,
        error: "Accent color must be a 6-digit hex code (e.g. #E8850C)",
        field: "accentColor",
      };
    }

    if (formData.logoUrl && !isValidLogoUrl(formData.logoUrl)) {
      return {
        success: false,
        error: "Logo URL must start with https:// or /storage/",
        field: "logoUrl",
      };
    }

    // Both colors must be set together or both empty
    const hasPrimary = Boolean(formData.primaryColor);
    const hasAccent = Boolean(formData.accentColor);
    if (hasPrimary !== hasAccent) {
      return {
        success: false,
        error: "Both primary and accent colors must be set together",
        field: hasPrimary ? "accentColor" : "primaryColor",
      };
    }

    // Build RPC args with p_clear support
    const rpcArgs = buildBrandingArgs(formData.gymId, formData);

    // Call the RPC
    const { error } = await supabase.rpc("set_gym_branding", rpcArgs);

    if (error) {
      // Check for session expired or offline errors first
      if (isSessionExpired(error)) {
        return { success: false, error: "Your session has expired. Please sign in again." };
      }

      if (isOfflineError(error)) {
        return { success: false, error: "You appear to be offline. Please check your connection." };
      }

      // Map known error codes to user-friendly messages
      if (error.code === "BRND1") {
        return { success: false, error: "Only the gym owner can update branding" };
      }
      if (error.code === "BRND2") {
        return {
          success: false,
          error: "Primary color must be a 6-digit hex code",
          field: "primaryColor",
        };
      }
      if (error.code === "BRND3") {
        return {
          success: false,
          error: "Accent color must be a 6-digit hex code",
          field: "accentColor",
        };
      }
      if (error.code === "BRND4") {
        return {
          success: false,
          error: "Logo URL must start with https:// or /storage/",
          field: "logoUrl",
        };
      }
      if (error.code === "BRND6") {
        return { success: false, error: "Invalid branding field" };
      }
      if (error.code === "BRND7") {
        return { success: false, error: "Both colors must be set or cleared together" };
      }

      // Generic fallback (do not expose raw error.message to user)
      console.error("Branding update error:", error);
      return { success: false, error: "Couldn't save your branding. Please try again." };
    }

    // Invalidate the brand cache
    revalidateTag(gymBrandTag(formData.gymId), "max");

    return { success: true };
  } catch (error) {
    // Catch any unexpected errors (network failures, etc.)
    console.error("Unexpected error in updateBranding:", error);
    
    if (error instanceof Error) {
      if (isSessionExpired(error)) {
        return { success: false, error: "Your session has expired. Please sign in again." };
      }
      if (isOfflineError(error)) {
        return { success: false, error: "You appear to be offline. Please check your connection." };
      }
    }

    return { success: false, error: "Couldn't save your branding. Please try again." };
  }
}
