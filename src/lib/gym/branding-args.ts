/**
 * Build RPC arguments for set_gym_branding.
 * 
 * This is a pure function extracted for testing.
 * It determines which fields to set and which to clear based on form input.
 */

export type BrandingFormInput = {
  displayName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
};

export type SetGymBrandingArgs = {
  p_gym_id: string;
  p_display_name?: string;
  p_logo_url?: string;
  p_primary_color?: string;
  p_accent_color?: string;
  p_clear?: string[];
};

/**
 * Build RPC args from form input.
 * 
 * Rules:
 * - Empty strings become p_clear entries (not undefined)
 * - Non-empty strings become p_<field> values
 * - Color pair: if both colors are empty, clear both; if one is non-empty, validate pair rule upstream
 */
export function buildBrandingArgs(
  gymId: string,
  formData: BrandingFormInput
): SetGymBrandingArgs {
  const args: SetGymBrandingArgs = {
    p_gym_id: gymId,
  };

  const clearFields: string[] = [];

  // Display name
  if (formData.displayName.trim() === "") {
    clearFields.push("display_name");
  } else {
    args.p_display_name = formData.displayName;
  }

  // Logo URL
  if (formData.logoUrl.trim() === "") {
    clearFields.push("logo_url");
  } else {
    args.p_logo_url = formData.logoUrl;
  }

  // Colors: pair rule - if both empty, clear both
  const primaryEmpty = formData.primaryColor.trim() === "";
  const accentEmpty = formData.accentColor.trim() === "";

  if (primaryEmpty && accentEmpty) {
    clearFields.push("primary_color", "accent_color");
  } else {
    // At least one is non-empty, so set them (validation upstream will check pair rule)
    if (!primaryEmpty) {
      args.p_primary_color = formData.primaryColor;
    }
    if (!accentEmpty) {
      args.p_accent_color = formData.accentColor;
    }
  }

  if (clearFields.length > 0) {
    args.p_clear = clearFields;
  }

  return args;
}
