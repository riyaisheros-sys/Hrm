import { useEffect, useRef } from 'react'
import { Paperclip, X } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * File picker with the "Choose file" button and the chosen file name(s) shown
 * separately (client, 26 Nov: the browser's own "Choose File / No file
 * chosen" ran together). Controlled: `files` is the current choice; pass []
 * to clear it. The real <input type="file"> stays in the page (visually
 * hidden) and carries `testid`, so tests can still set files on it.
 */
export function FileInput({
  id,
  testid,
  files,
  onChange,
  accept,
  multiple = false,
  buttonLabel,
  hint,
  className,
}: {
  id: string
  testid?: string
  files: File[]
  onChange: (files: File[]) => void
  accept?: string
  multiple?: boolean
  buttonLabel?: string
  /** Short help under the picker, e.g. allowed types. */
  hint?: string
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  // Clearing from the outside also clears the native input, so picking the
  // same file again still fires a change.
  useEffect(() => {
    if (files.length === 0 && ref.current) ref.current.value = ''
  }, [files.length])

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex min-w-0 items-center gap-2">
        <label
          htmlFor={id}
          className="hover:border-brand-300 hover:text-brand-700 focus-within:ring-brand-500 inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus-within:ring-2"
        >
          <Paperclip className="size-4" />
          {buttonLabel ?? (multiple ? 'Choose files' : 'Choose file')}
          <input
            ref={ref}
            id={id}
            data-testid={testid}
            type="file"
            accept={accept}
            multiple={multiple}
            className="sr-only"
            onChange={(e) => onChange(Array.from(e.target.files ?? []))}
          />
        </label>
        <span
          className={cn(
            'min-w-0 flex-1 truncate rounded-lg border border-dashed px-3 py-2 text-sm',
            files.length
              ? 'border-slate-300 bg-slate-50 text-slate-800'
              : 'border-slate-200 text-slate-400',
          )}
          title={files.map((f) => f.name).join(', ')}
          data-testid={testid ? `${testid}-name` : undefined}
        >
          {files.length === 0
            ? 'No file chosen'
            : files.length === 1
              ? files[0].name
              : `${files.length} files: ${files.map((f) => f.name).join(', ')}`}
        </span>
        {files.length > 0 && (
          <button
            type="button"
            aria-label="Remove chosen file"
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={() => onChange([])}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
