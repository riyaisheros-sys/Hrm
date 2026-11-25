import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useDeleteTemplate, type OnboardingTemplate } from './hooks'
import { TemplateModal } from './TemplateModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/toast-context'

/** Edit / delete buttons for a document template row (onboarding or exit). */
export function TemplateRowActions({
  template,
  docTypes,
}: {
  template: OnboardingTemplate
  docTypes: readonly string[]
}) {
  const remove = useDeleteTemplate()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  return (
    <>
      <button
        type="button"
        data-testid="edit-template"
        aria-label={`Edit template ${template.title}`}
        className="hover:text-brand-600 rounded p-1 text-slate-400"
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        data-testid="delete-template"
        aria-label={`Delete template ${template.title}`}
        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
        onClick={() => setDeleting(true)}
      >
        <Trash2 className="size-4" />
      </button>
      {editing && (
        <TemplateModal docTypes={docTypes} template={template} onClose={() => setEditing(false)} />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete template"
          testid="delete-template-dialog"
          confirmLabel="Delete"
          loading={remove.isPending}
          onClose={() => setDeleting(false)}
          message={
            <p>
              Delete template <span className="font-semibold text-slate-900">{template.title}</span>?
              Letters already generated are not affected. This cannot be undone.
            </p>
          }
          onConfirm={() =>
            remove.mutate(template.id, {
              onSuccess: () => {
                toast.success('Template deleted')
                setDeleting(false)
              },
              onError: (err) => toast.error('Delete failed', (err as Error).message),
            })
          }
        />
      )}
    </>
  )
}
