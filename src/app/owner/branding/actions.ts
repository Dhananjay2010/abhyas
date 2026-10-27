"use server";

import { revalidateTag } from "next/cache";
import { getAuthedClient } from "@/lib/supabase/auth";
import { checkGymOwnership } from "@/lib/gym/owner-check";
import { gymBrandTag } from "@/lib/gym-brand";

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
 * Validate a hex color
 */
function isValidHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

/**
 * Validate a logo URL
 */
function isValidLogoUrl(url: string): boolean {
  if (!url) return true; // empty is OK (will be set to null)
  return url.startsWith("https://") || url.startsWith("/storage/");
}

/**
 * Update gym branding settings (owner-only)
 */
export async function updateBranding(
  formData: BrandingFormData,
): Promise<BrandingResult> {
  const { supabase, user } = await getAuthedClient();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const ownership = await checkGymOwnership(supabase, user.id);
  if (!ownership.isOwner || ownership.gymId !== formData.gymId) {
    return { success: false, error: "Not authorized" };
  }

  // Validate inputs
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

  // Call the RPC
  const { error } = await supabase.rpc("set_gym_branding", {
    p_gym_id: formData.gymId,
    p_display_name: formData.displayName || undefined,
    p_logo_url: formData.logoUrl || undefined,
    p_primary_color: formData.primaryColor || undefined,
    p_accent_color: formData.accentColor || undefined,
  });

  if (error) {
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
    if (error.code === "BRND5") {
      return { success: false, error: "Gym not found" };
    }

    return { success: false, error: error.message };
  }

  // Invalidate the brand cache
  revalidateTag(gymBrandTag(formData.gymId), "max");

  return { success: true };
}
