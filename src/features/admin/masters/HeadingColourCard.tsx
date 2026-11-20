import { useEffect, useRef, useState } from 'react'
import { Check, Palette } from 'lucide-react'
import {
  applyHeadingColour,
  HEADING_COLOUR_PRESETS,
  headingTextColour,
  useHeadingColour,
  useSaveHeadingColour,
} from '@/lib/appearance'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/toast-context'
import { cn } from '@/lib/cn'

/**
 * Pick the colour of every table heading in the platform. Clicking a colour
 * previews it straight away on the tables on screen; nothing is kept until
 * Save, and Cancel (or leaving the page) puts the saved colour back.
 */
export function HeadingColourCard() {
  const { data } = useHeadingColour()
  const save = useSaveHeadingColour()
  const toast = useToast()
  const saved = data?.colour ?? null
  // undefined = nothing picked yet; null = "Default" picked.
  const [draft, setDraft] = useState<string | null | undefined>(undefined)
  const current = draft === undefined ? saved : draft
  const dirty = draft !== undefined && draft !== saved

  const savedRef = useRef(saved)
  savedRef.current = saved
  // Leaving with an unsaved preview must not leave the app in that colour.
  useEffect(() => () => applyHeadingColour(savedRef.current), [])

  const pick = (colour: string | null) => {
    setDraft(colour)
    applyHeadingColour(colour)
  }
  const cancel = () => {
    setDraft(undefined)
    applyHeadingColour(saved)
  }
  const commit = () => {
    save.mutate(
      { colour: current, shared: data?.shared ?? false },
      {
        onSuccess: () => {
          toast.success(
            'Heading colour saved',
            data?.shared
              ? 'Every table heading in the platform now uses it, for all users.'
              : 'Applied on this browser.',
          )
          setDraft(undefined)
        },
        onError: (error) => {
          toast.error('Could not save the heading colour', (error as Error).message)
          cancel()
        },
      },
    )
  }

  const isPreset = !!current && HEADING_COLOUR_PRESETS.some((p) => p.value === current)

  return (
    <div
      data-testid="heading-colour-card"
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <Palette className="size-4 text-brand-600" />
        <div>
          <div className="text-sm font-semibold text-slate-900">Table heading colour</div>
          <div className="text-xs text-slate-500">Applies to every table heading in the platform</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          data-testid="heading-colour-default"
          onClick={() => pick(null)}
          className={cn(
            'h-7 rounded-full border px-3 text-xs font-medium',
            current === null
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-slate-300 bg-slate-50 text-slate-600 hover:border-slate-400',
          )}
        >
          Default
        </button>
        {HEADING_COLOUR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            title={preset.label}
            aria-label={`${preset.label} heading colour`}
            data-testid={`heading-colour-${preset.label.toLowerCase()}`}
            onClick={() => pick(preset.value)}
            style={{ backgroundColor: preset.value, color: headingTextColour(preset.value) }}
            className={cn(
              'grid size-7 place-items-center rounded-full border border-black/10',
              current === preset.value && 'ring-2 ring-brand-500 ring-offset-2',
            )}
          >
            {current === preset.value && <Check className="size-3.5" />}
          </button>
        ))}
        <label
          title="Any other colour"
          className={cn(
            'ml-1 flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-slate-300 pr-2.5 pl-1 text-xs font-medium text-slate-600 hover:border-slate-400',
            current && !isPreset && 'ring-2 ring-brand-500 ring-offset-2',
          )}
        >
          <input
            type="color"
            data-testid="heading-colour-custom"
            value={current ?? '#f8fafc'}
            onChange={(event) => pick(event.target.value)}
            className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
          />
          Custom
        </label>
      </div>

      {dirty && (
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="heading-colour-cancel"
            onClick={cancel}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            data-testid="heading-colour-save"
            onClick={commit}
            disabled={save.isPending}
          >
            Save
          </Button>
        </div>
      )}
      {data && !data.shared && (
        <p className="basis-full text-xs text-amber-700" data-testid="heading-colour-local-note">
          Saved on this browser only for now — it will apply to all users once the pending
          database update is applied.
        </p>
      )}
    </div>
  )
}
