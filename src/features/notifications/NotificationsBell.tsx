import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationsRealtime,
} from './hooks'

/**
 * Header bell: shows unread count and a dropdown of recent notifications.
 * Clicking a notification marks it read and navigates to its link.
 */
export function NotificationsBell() {
  useNotificationsRealtime()
  const { data: notifications = [] } = useNotifications(20)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllRead()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const unread = notifications.filter((n) => !n.read_at)
  const unreadCount = unread.length

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
                      onClick={() => {
                        if (!n.read_at) markRead.mutate(n.id)
                        setOpen(false)
                        if (n.link) navigate(n.link)
                      }}
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
    </div>
  )
}
