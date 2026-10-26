"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buildCycle, type BreathPhase } from "@/lib/breathing/engine";
import { DRAFT_PHASES, draftFrom, mineSlug, toEditorSlots } from "@/lib/breathing/pattern";
import { MAX_NAME_LENGTH, validatePatternDraft } from "@/lib/breathing/validation";
import { deleteCustomPattern, saveCustomPattern } from "../actions";
import { Icon } from "../controls";
import { RhythmPreview } from "../rhythm-preview";
import { TimingEditor } from "../timing-editor";

type Actions = {
  saveCustomPattern: typeof saveCustomPattern;
  deleteCustomPattern: typeof deleteCustomPattern;
};
const REAL: Actions = { saveCustomPattern, deleteCustomPattern };

/**
 * A practice of your own: a name, and how long each part of the breath lasts.
 *
 * It starts as a box with the holds switched off, because that is the shape
 * most people describe when they describe a breathing pattern. Stepping a hold
 * up from zero turns it on; taking it to zero turns it off again.
 */
export function CustomPatternForm({
  existing,
  basePath = "/breathe",
  actions = REAL,
}: {
  existing?: { id: string; name: string; phases: BreathPhase[] };
  basePath?: string;
  actions?: Actions;
}) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? "");
  // Every slot is shown, so a phase that is off can be turned back on.
  const [phases, setPhases] = useState<BreathPhase[]>(() =>
    existing ? toEditorSlots(existing.phases) : DRAFT_PHASES,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const draft = draftFrom(name, phases);
  const timed = draft.phases;
  const preview = timed.length > 0 && timed.some((p) => p.kind === "inhale" && p.seconds > 0) &&
    timed.some((p) => p.kind === "exhale" && p.seconds > 0)
      ? timed
      : null;

  const save = () => {
    const invalid = validatePatternDraft(draft);
    if (invalid) return setError(invalid);
    setError(null);
    startTransition(async () => {
      const r = await actions.saveCustomPattern({ id: existing?.id, draft });
      if (!r.ok) return setError(r.error);
      router.replace(`${basePath}/${mineSlug(r.data.id)}`);
    });
  };

  const remove = () => {
    if (!existing) return;
    setError(null);
    startTransition(async () => {
      const r = await actions.deleteCustomPattern(existing.id);
      if (!r.ok) return setError(r.error);
      router.replace(basePath);
    });
  };

  return (
    <>
      <Link
        href={basePath}
        className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
      >
        <Icon.Back /> Breathe
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">
        {existing ? "Edit your practice" : "Your own practice"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Name it, and set how long each part of the breath lasts. A hold at zero is
        simply left out.
      </p>

      {preview && (
        <div className="mt-6 flex justify-center">
          <RhythmPreview phases={preview} size={120} />
        </div>
      )}

      <label className="mt-6 block">
        <span className="text-sm font-medium">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Evening wind-down"
          className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base text-fg outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
        />
      </label>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-medium">The breath</h2>
        <TimingEditor phases={phases} onChange={setPhases} />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mt-6 w-full rounded-xl bg-accent px-6 py-4 text-base font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {busy ? "Saving…" : existing ? "Save changes" : "Save and try it"}
      </button>

      {existing && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="mt-3 w-full px-6 py-3 text-sm text-muted transition-colors hover:text-danger"
        >
          Delete this practice
        </button>
      )}

      {existing && (
        <p className="mt-2 text-center text-xs text-muted">
          Deleting it keeps the practices you have already done in your history.
        </p>
      )}

      {timed.length > 0 && (
        <p className="mt-6 text-center text-xs text-muted tabular-nums">
          {Math.round(buildCycle(timed).seconds * 10) / 10}s a breath
        </p>
      )}
    </>
  );
}
