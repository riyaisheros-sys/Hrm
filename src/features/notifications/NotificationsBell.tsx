import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, BellRing, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationsRealtime,
  type NotificationRow,
} from './hooks'

const POPUP_KEY = 'hrms:notification-popups'
const readPopupPref = () => {
  try {
    return localStorage.getItem(POPUP_KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * Header bell: shows unread count and a dropdown of recent notifications.
 * Clicking a notification marks it read and navigates to its link.
 */
export function NotificationsBell() {
  useNotificationsRealtime()
  const { data: notifications = [], isFetched } = useNotifications(20)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllRead()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const unread = notifications.filter((n) => !n.read_at)
  const unreadCount = unread.length

  // Pop-ups: a new unread notification that arrives while the app is open
  // shows for a few seconds in the corner. Can be switched off from the bell.
  const [popupsOn, setPopupsOn] = useState(readPopupPref)
  const [popups, setPopups] = useState<NotificationRow[]>([])
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!isFetched) return
    if (!seen.current) {
      // First load: everything already there is old news.
      seen.current = new Set(notifications.map((n) => n.id))
      return
    }
    const fresh = notifications.filter((n) => !n.read_at && !seen.current!.has(n.id))
    for (const n of notifications) seen.current.add(n.id)
    if (fresh.length && popupsOn) setPopups((prev) => [...fresh, ...prev].slice(0, 3))
  }, [notifications, isFetched, popupsOn])
  useEffect(() => {
    if (!popups.length) return
    const timer = window.setTimeout(() => setPopups((prev) => prev.slice(0, -1)), 8000)
    return () => window.clearTimeout(timer)
  }, [popups])
  const togglePopups = () => {
    const next = !popupsOn
    setPopupsOn(next)
    if (!next) setPopups([])
    try {
      localStorage.setItem(POPUP_KEY, next ? 'on' : 'off')
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  }
  const openNotification = (n: NotificationRow) => {
    if (!n.read_at) markRead.mutate(n.id)
    setPopups((prev) => prev.filter((p) => p.id !== n.id))
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={containerRef} data-testid="notifications-bell">
      <button
        type="button"
        data-testid="notifications-bell-button"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span
            data-testid="notifications-unread-badge"
            className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          data-testid="notifications-dropdown"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            <button
              type="button"
              data-testid="notifications-popup-toggle"
              onClick={togglePopups}
              title={popupsOn ? 'Pop-ups are on — click to turn off' : 'Pop-ups are off — click to turn on'}
              className="ml-auto mr-3 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
            >
              {popupsOn ? <BellRing className="size-3.5" /> : <BellOff className="size-3.5" />}
              Pop-ups {popupsOn ? 'on' : 'off'}
            </button>
            {unreadCount > 0 && (
              <button
                type="button"
                data-testid="notifications-mark-all"
                onClick={() => markAll.mutate()}
                className="text-brand-600 text-xs hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">
                No notifications yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      data-testid="notifications-item"
                      onClick={() => openNotification(n)}
                      className={cn(
                        'block w-full px-3 py-2 text-left hover:bg-slate-50',
                        !n.read_at && 'bg-brand-50/40',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read_at && (
                          <span className="bg-brand-500 mt-1.5 size-2 shrink-0 rounded-full" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{n.title}</p>
                          {n.body && (
                            <p className="line-clamp-2 text-xs text-slate-500">{n.body}</p>
                          )}
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {new Date(n.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {popups.length > 0 && (
        <div
          className="fixed top-16 right-4 z-[60] w-80 space-y-2"
          data-testid="notification-popups"
          aria-live="polite"
        >
          {popups.map((n) => (
            <div
              key={n.id}
              data-testid="notification-popup"
              className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
            >
              <span className="bg-brand-100 text-brand-700 grid size-8 shrink-0 place-items-center rounded-full">
                <BellRing className="size-4" />
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => openNotification(n)}
              >
                <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                {n.body && <p className="line-clamp-2 text-xs text-slate-600">{n.body}</p>}
                {n.link && <p className="text-brand-600 mt-1 text-xs font-medium">Open →</p>}
              </button>
              <button
                type="button"
                aria-label="Dismiss notification"
                className="rounded p-0.5 text-slate-400 hover:text-slate-700"
                onClick={() => setPopups((prev) => prev.filter((p) => p.id !== n.id))}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
