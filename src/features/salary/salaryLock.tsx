import { useState, useSyncExternalStore } from 'react'
import { Eye, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'

/**
 * Salary amounts stay hidden for employees until they re-enter their login
 * password (client, 26 Nov: "Salary hide honi chahiye aur password ke through
 * open karne ka option"). Once confirmed they stay visible for 10 minutes in
 * this browser tab, then hide again.
 */
const KEY = 'hrms:salary-visible-until'
const WINDOW_MS = 10 * 60 * 1000
const listeners = new Set<() => void>()

function visibleUntil(): number {
  try {
    return Number(sessionStorage.getItem(KEY) ?? 0) || 0
  } catch {
    return 0
  }
}
function setVisibleUntil(value: number) {
  try {
    if (value) sessionStorage.setItem(KEY, String(value))
    else sessionStorage.removeItem(KEY)
  } catch {
    // storage blocked: fall back to this render only
  }
  listeners.forEach((l) => l())
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  // Re-check every 30 s so the amounts hide again when the window runs out.
  const timer = window.setInterval(listener, 30_000)
  return () => {
    listeners.delete(listener)
    window.clearInterval(timer)
  }
}

/** True while the employee has confirmed their password recently. */
export function useSalaryVisible() {
  // The snapshot is the yes/no itself, so the 30-second check re-renders the
  // moment the window runs out.
  const visible = useSyncExternalStore(subscribe, () => visibleUntil() > Date.now(), () => false)
  return { visible, hide: () => setVisibleUntil(0) }
}

export const MASKED = '₹ ••••••'

/** Asks for the login password; on success salary amounts show for 10 minutes. */
export function SalaryPasswordModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  return (
    <Modal open onClose={onClose} title="View salary" testid="salary-password-modal">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!user?.email) return
          setChecking(true)
          setError(null)
          const { error: authError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password,
          })
          setChecking(false)
          if (authError) {
            setError('Incorrect password. Please try again.')
            return
          }
          setVisibleUntil(Date.now() + WINDOW_MS)
          onClose()
        }}
      >
        <p className="text-sm text-slate-600">
          Salary details are private. Enter your login password to view them. They will hide
          again after 10 minutes.
        </p>
        <div>
          <Label htmlFor="salary-password">Your password</Label>
          <Input
            id="salary-password"
            data-testid="salary-password-input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <p className="mt-1 text-xs text-red-600" data-testid="salary-password-error">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="salary-password-submit" loading={checking}>
            <Eye className="size-4" /> View salary
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Small "hidden — view" control used on the dashboard and My Salary. */
export function SalaryRevealButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="salary-reveal"
      onClick={onClick}
      className="text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium"
    >
      <Lock className="size-3.5" /> Hidden · enter password to view
    </button>
  )
}
