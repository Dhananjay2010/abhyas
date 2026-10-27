"use client";

import { useState, useTransition } from "react";
import { updateBranding, type BrandingResult } from "./actions";

type BrandingFormProps = {
  gymId: string;
  gymName: string;
  initial: {
    gymName: string;
    displayName: string;
    logoUrl: string;
    primaryColor: string;
    accentColor: string;
  };
};

export function BrandingForm({ gymId, gymName, initial }: BrandingFormProps) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [accentColor, setAccentColor] = useState(initial.accentColor);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage("");

    startTransition(async () => {
      try {
        const result: BrandingResult = await updateBranding({
          gymId,
          displayName,
          logoUrl,
          primaryColor,
          accentColor,
        });

        if (result.success) {
          setSuccessMessage("Branding updated successfully");
          setTimeout(() => setSuccessMessage(""), 3000);
        } else {
          if (result.field) {
            setErrors({ [result.field]: result.error });
          } else {
            setErrors({ _form: result.error });
          }
        }
      } catch (error) {
        // Handle unexpected errors (should be rare after MED-2 fixes)
        console.error("Form submit error:", error);
        setErrors({ 
          _form: "Couldn't save your branding. Please check your connection and try again." 
        });
      }
    });
  };

  // Preview colors (use user input or neutral defaults from CSS custom properties)
  // These are passed into CSS custom properties on the preview wrapper
  const previewPrimary = primaryColor || "var(--color-muted)";
  const previewAccent = accentColor || "var(--color-border)";
  
  // Compute accessible text color for preview when a valid color is entered
  // Use simple contrast: if sum of RGB > 382 (roughly half of max 765), use black, else white
  const getTextColor = (bgColor: string): string => {
    if (!bgColor || !bgColor.match(/^#[0-9A-Fa-f]{6}$/)) {
      return "#1a1000"; // default accentFg from branding
    }
    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    // Simple luminance check: if bright background, use dark text
    return (r + g + b > 382) ? "#000000" : "#ffffff";
  };
  
  const previewTextColor = primaryColor && primaryColor.match(/^#[0-9A-Fa-f]{6}$/) 
    ? getTextColor(primaryColor) 
    : "#1a1000";

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* General Error */}
      {errors._form && (
        <div className="rounded-lg bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
          {errors._form}
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="rounded-lg bg-success/10 border border-success/30 px-4 py-3 text-sm text-success">
          {successMessage}
        </div>
      )}

      {/* Gym Name (read-only) */}
      <div>
        <label className="block text-sm font-medium mb-2">Gym Name</label>
        <input
          type="text"
          value={gymName}
          disabled
          className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-muted cursor-not-allowed"
        />
        <p className="mt-1 text-xs text-muted">
          The gym name cannot be changed here. Contact support if needed.
        </p>
      </div>

      {/* Display Name */}
      <div>
        <label htmlFor="displayName" className="block text-sm font-medium mb-2">
          Display Name (optional)
        </label>
        <input
          type="text"
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={gymName}
          className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <p className="mt-1 text-xs text-muted">
          Optional shorter name for branding. Leave empty to use the gym name.
        </p>
        {errors.displayName && (
          <p className="mt-1 text-xs text-danger">{errors.displayName}</p>
        )}
      </div>

      {/* Logo URL */}
      <div>
        <label htmlFor="logoUrl" className="block text-sm font-medium mb-2">
          Logo URL (optional)
        </label>
        <input
          type="text"
          id="logoUrl"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
          className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <p className="mt-1 text-xs text-muted">
          Full URL (https://...) or Supabase Storage path (/storage/...).
        </p>
        {errors.logoUrl && (
          <p className="mt-1 text-xs text-danger">{errors.logoUrl}</p>
        )}
      </div>

      {/* Colors Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Brand Colors</h2>
        <p className="text-sm text-muted">
          Set both primary and accent colors together. Leave both empty to use
          default colors.
        </p>

        {/* Primary Color */}
        <div>
          <label htmlFor="primaryColor" className="block text-sm font-medium mb-2">
            Primary Color
          </label>
          <div className="flex gap-3">
            <input
              type="color"
              id="primaryColorPicker"
              value={previewPrimary}
              onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
              className="h-12 w-16 rounded-lg border border-border bg-surface-2 cursor-pointer"
            />
            <input
              type="text"
              id="primaryColor"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
              placeholder="#FF9A2E"
              className="flex-1 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            6-digit hex code (e.g. #FF9A2E) for buttons and highlights
          </p>
          {errors.primaryColor && (
            <p className="mt-1 text-xs text-danger">{errors.primaryColor}</p>
          )}
        </div>

        {/* Accent Color */}
        <div>
          <label htmlFor="accentColor" className="block text-sm font-medium mb-2">
            Accent Color (hover)
          </label>
          <div className="flex gap-3">
            <input
              type="color"
              id="accentColorPicker"
              value={previewAccent}
              onChange={(e) => setAccentColor(e.target.value.toUpperCase())}
              className="h-12 w-16 rounded-lg border border-border bg-surface-2 cursor-pointer"
            />
            <input
              type="text"
              id="accentColor"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value.toUpperCase())}
              placeholder="#E8850C"
              className="flex-1 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            6-digit hex code (e.g. #E8850C) for hover states
          </p>
          {errors.accentColor && (
            <p className="mt-1 text-xs text-danger">{errors.accentColor}</p>
          )}
        </div>
      </div>

      {/* Live Preview */}
      <div className="rounded-lg border border-border bg-surface p-6 space-y-4">
        <h3 className="text-sm font-semibold text-muted">Live Preview</h3>
        <div
          className="space-y-3"
          style={{
            // Set CSS custom properties for preview (same names as main theming)
            // @ts-expect-error - CSS custom properties are not in React.CSSProperties
            "--color-accent": previewPrimary,
            "--color-accent-hover": previewAccent,
            "--color-accent-fg": previewTextColor,
          }}
        >
          {/* Preview button using CSS variables with hover */}
          <button
            type="button"
            className="w-full rounded-lg px-6 py-3 text-sm font-semibold transition-colors hover:brightness-90"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-accent-fg)",
            }}
          >
            Start Workout
          </button>
          <p className="text-xs text-muted text-center">
            Hover or tap to see the accent color effect
          </p>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}
