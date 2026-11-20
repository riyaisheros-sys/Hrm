/**
 * Sidebar grouping — two buckets per client ask (19 Nov):
 *   • Entries — anywhere the user creates or modifies data
 *   • Reports — view-only pages (lists, logs, dashboards)
 * Dashboard sits pinned at the top under "Home" and isn't counted in either
 * bucket. The same split is used for both admin and employee views.
 *
 * An item that isn't listed here falls into 'entries' by default — safer to
 * surface a modification surface than hide it in Reports.
 */

export interface SidebarGroupDef {
  id: string
  label: string
}

const TWO_GROUPS: SidebarGroupDef[] = [
  { id: 'home',    label: 'Home' },
  { id: 'entries', label: 'Entries' },
  { id: 'reports', label: 'Reports' },
]

export const ADMIN_SIDEBAR_GROUPS = TWO_GROUPS
export const EMPLOYEE_SIDEBAR_GROUPS = TWO_GROUPS

export const SIDEBAR_GROUP_FOR: Record<string, Record<string, string>> = {
  admin: {
    'nav-dashboard':         'home',
    // Entries — admin creates/edits data here
    'nav-attendance':        'entries',
    'nav-attendance-settings': 'entries',
    'nav-planning-admin':    'entries',
    'nav-tasks':             'entries',
    'nav-users':             'entries',
    'nav-hierarchy':         'entries',
    'nav-recruitment':       'entries',
    'nav-onboarding':        'entries',
    'nav-lifecycle':         'entries',
    'nav-salary-admin':      'entries',
    'nav-appraisal-admin':   'entries',
    'nav-kra-kpi':           'entries',
    'nav-documents':         'entries',
    'nav-assets':            'entries',
    'nav-training':          'entries',
    'nav-policies-admin':    'entries',
    'nav-workflows':         'entries',
    'nav-visitors':          'entries',
    'nav-leave-admin':       'entries',
    'nav-helpdesk-admin':    'entries',
    'nav-recognition-admin': 'entries',
    'nav-masters':           'entries',
    'nav-employee-panel':    'entries',
    'nav-roles':             'entries',
    // Reports — view-only surfaces
    'nav-monitoring':        'reports',
    'nav-reports':           'reports',
    'nav-audit':             'reports',
  },
  employee: {
    'nav-dashboard':      'home',
    // Entries — employee writes something here
    'nav-my-attendance':  'entries',
    'nav-planning':       'entries',
    'nav-tasks':          'entries',
    'nav-leave':          'entries',
    'nav-policies':       'entries',
    'nav-my-workflows':   'entries',
    'nav-helpdesk':       'entries',
    'nav-visitors-self':  'entries',
    'nav-training-self':  'entries',
    // Reports — view-only surfaces for the employee
    'nav-salary':         'reports',
    'nav-appraisal':      'reports',
    'nav-announcements':  'reports',
    'nav-recognition':    'reports',
    'nav-my-assets':      'reports',
    'nav-monitoring-self':'reports',
  },
}

/** Group id for a nav testid (unmapped items fall into Entries). */
export function groupForNav(mode: 'admin' | 'employee', testid: string): string {
  return SIDEBAR_GROUP_FOR[mode]?.[testid] ?? 'entries'
}

export function sidebarGroupsFor(mode: 'admin' | 'employee'): SidebarGroupDef[] {
  return mode === 'admin' ? ADMIN_SIDEBAR_GROUPS : EMPLOYEE_SIDEBAR_GROUPS
}
