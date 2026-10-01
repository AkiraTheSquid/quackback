import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import {
  ChatBubbleLeftIcon,
  MapIcon,
  UsersIcon,
  Cog6ToothIcon,
  Bars3Icon,
  GlobeAltIcon,
  DocumentTextIcon,
  BookOpenIcon,
  ChartBarIcon,
  QuestionMarkCircleIcon,
  HomeIcon,
  SignalIcon,
  SparklesIcon,
} from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { signOut } from '@/lib/client/auth-client'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { NotificationBell } from '@/components/notifications'
import { cn } from '@/lib/shared/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { LatestVersionResult } from '@/lib/server/functions/version'
import type { SettingsBrandingData } from '@/lib/server/domains/settings/settings.types'
import { setAgentAvailabilityFn } from '@/lib/server/functions/conversation'
import {
  listOwnerWorkspacesFn,
  openOwnerWorkspaceFn,
} from '@/lib/server/functions/owner-workspaces'
import { friendlySiblingAddress, WorkspaceSwitcher } from '@/components/admin/workspace-switcher'
import { usePermission } from '@/lib/client/hooks/use-permission'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { isProductEnabled, type FeatureFlags, type ProductId } from '@/lib/shared/types/settings'
import { adminQueries } from '@/lib/client/queries/admin'
import { ENTITY_ICONS } from '@/components/admin/entity-icon'
import {
  useBillingEnabled,
  useRefinedTheme,
  useSessionContext,
  useUserRole,
  useWorkspaceSettings,
} from '@/lib/client/hooks/use-root-context'

/** Availability toggle for the account menu (conversation routing). The label shows the
 *  state you'll switch to; the avatar dot shows the current one. */
function AvailabilityMenuItems({
  availability,
  onSet,
}: {
  availability: 'online' | 'away'
  onSet: (next: 'online' | 'away') => void
}) {
  const goingAway = availability === 'online'
  return (
    <DropdownMenuItem onClick={() => onSet(goingAway ? 'away' : 'online')}>
      {goingAway ? 'Set yourself as away' : 'Set yourself as active'}
    </DropdownMenuItem>
  )
}

interface AdminSidebarProps {
  initialUserData?: {
    name: string | null
    email: string | null
    avatarUrl: string | null
    chatAvailability?: 'online' | 'away'
  }
  latestVersion?: LatestVersionResult | null
}

const AUTOMATION_HREF = '/admin/automation'

interface RailItem {
  label: string
  href: string
  icon: typeof ChatBubbleLeftIcon
  /** Active on this path only, not on the pages under it. */
  exact?: boolean
  /** The workspace product this item belongs to; hidden while it is off. */
  product?: ProductId
}

// One product reads as one run: Feedback, Roadmap and Changelog sit together,
// then Support, Help Center and Status.
const RAIL_ITEMS: RailItem[] = [
  { label: 'Home', href: '/admin', icon: HomeIcon, exact: true },
  { label: 'Feedback', href: '/admin/feedback', icon: ENTITY_ICONS.post, product: 'feedback' },
  { label: 'Roadmap', href: '/admin/roadmap', icon: MapIcon, product: 'feedback' },
  {
    label: 'Changelog',
    href: '/admin/changelog',
    icon: ENTITY_ICONS.changelog,
    product: 'changelog',
  },
  // One Support entry covers conversations and tickets: the unified inbox
  // shell serves both (gated on either flag being on).
  { label: 'Support', href: '/admin/inbox', icon: ENTITY_ICONS.conversation, product: 'support' },
  {
    label: 'Help Center',
    href: '/admin/help-center',
    icon: ENTITY_ICONS.article,
    product: 'helpCenter',
  },
  { label: 'Status', href: '/admin/status', icon: SignalIcon, product: 'status' },
  { label: 'Analytics', href: '/admin/analytics', icon: ChartBarIcon },
  // The area index sends each viewer to the first page they can open.
  { label: 'AI & Automation', href: AUTOMATION_HREF, icon: SparklesIcon },
  { label: 'Users', href: '/admin/users', icon: UsersIcon },
]

/** The rail items a viewer sees: products that are on, and AI & Automation for those who can open it. */
export function buildRailItems(
  flags: Partial<FeatureFlags> | undefined,
  canOpenAutomation: boolean
): RailItem[] {
  return RAIL_ITEMS.filter((item) => {
    if (item.product && !isProductEnabled(flags, item.product)) return false
    if (item.href === AUTOMATION_HREF) return canOpenAutomation
    return true
  })
}

function railControlClass(labeled: boolean, isActive = false) {
  return cn(
    'relative transition-all duration-200',
    labeled
      ? 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm'
      : 'flex size-9 items-center justify-center rounded-lg',
    'text-muted-foreground/70 hover:text-foreground hover:bg-muted/50',
    isActive && 'bg-muted/80 text-foreground',
    labeled && isActive && 'font-semibold'
  )
}

/**
 * A rail item is active on its page and every page under it, whatever the
 * search. The Link works that out itself and renders again only when it
 * changes, so a navigation renders the items it highlights or clears, and a
 * search-only one (opening a post or a conversation) none.
 */
const NAV_ACTIVE_OPTIONS = { includeSearch: false }
const NAV_EXACT_OPTIONS = { exact: true, includeSearch: false }

const railLinkProps = (labeled: boolean, exact: boolean) => ({
  activeOptions: exact ? NAV_EXACT_OPTIONS : NAV_ACTIVE_OPTIONS,
  activeProps: { className: railControlClass(labeled, true), 'data-active': 'true' },
  inactiveProps: { className: railControlClass(labeled) },
})

const MOBILE_LINK_CLASS =
  'flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-muted-foreground/80 hover:text-foreground hover:bg-muted/50'

function NavItem({
  href,
  icon: Icon,
  label,
  onClick,
  badge,
  badgeLabel,
  dot,
  exact = false,
  labeled = false,
}: {
  href: string
  icon: typeof ChatBubbleLeftIcon
  label: string
  onClick?: () => void
  /** Optional count or short mark (e.g. remaining launch steps) */
  badge?: string | number | null
  /** What the badge counts, read out in place of the bare number. */
  badgeLabel?: string
  /** Quiet marker while the plan is resolved but the first win is still open */
  dot?: boolean
  /** Active on this path only, not on the pages under it. */
  exact?: boolean
  /** Icon + visible label. Legacy stays icon-only with a tooltip. */
  labeled?: boolean
}) {
  const link = (
    <Link
      to={href}
      onClick={onClick}
      data-admin-rail-item=""
      data-labeled={labeled ? '' : undefined}
      {...railLinkProps(labeled, exact)}
    >
      <Icon className="size-5 shrink-0" />
      {labeled ? (
        <span className="min-w-0 flex-1 truncate">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
      {badge != null && badge !== '' && (
        <span
          className={cn(
            labeled
              ? 'ms-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1'
              : 'absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1',
            'border-2 border-card bg-primary text-[11px] font-semibold text-primary-foreground'
          )}
        >
          <span aria-hidden="true">{badge}</span>
          <span className="sr-only">{badgeLabel ?? badge}</span>
        </span>
      )}
      {dot && (badge == null || badge === '') && (
        <span
          className={
            labeled
              ? 'ms-auto size-2 rounded-full bg-primary'
              : 'absolute top-0.5 right-0.5 size-2 rounded-full bg-primary'
          }
          aria-hidden="true"
        />
      )}
    </Link>
  )

  if (labeled) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function MobileNavLink({
  href,
  icon: Icon,
  label,
  onClick,
  exact = false,
  badge,
  badgeLabel,
}: {
  href: string
  icon: typeof ChatBubbleLeftIcon
  label: string
  onClick: () => void
  exact?: boolean
  badge?: number | null
  badgeLabel?: string
}) {
  return (
    <Link
      to={href}
      onClick={onClick}
      activeOptions={exact ? NAV_EXACT_OPTIONS : NAV_ACTIVE_OPTIONS}
      activeProps={{ className: cn(MOBILE_LINK_CLASS, 'bg-muted/80 text-foreground font-medium') }}
      inactiveProps={{ className: MOBILE_LINK_CLASS }}
    >
      <Icon className="h-5 w-5" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
          <span aria-hidden="true">{badge}</span>
          <span className="sr-only">{badgeLabel ?? badge}</span>
        </span>
      ) : null}
    </Link>
  )
}

export function AdminSidebar({ initialUserData, latestVersion }: AdminSidebarProps) {
  const refined = useRefinedTheme()
  const router = useRouter()
  const onNotificationsPage = useRouterState({
    select: (s) => s.location.pathname.startsWith('/admin/notifications'),
  })
  // Each part is selected: the route context is a new object after every
  // navigation, while these stay the same until the viewer or workspace changes.
  const session = useSessionContext()
  const settings = useWorkspaceSettings()
  const userRole = useUserRole()
  const billingEnabled = useBillingEnabled()
  // The settings area is admin-only (every tab gates on requireAuth(['admin'])).
  // Members would only ever land on the access-denied page, so hide the cog.
  const isAdmin = userRole === 'admin'
  const canManageAssistant = usePermission(PERMISSIONS.ASSISTANT_MANAGE)
  const canManageWorkflows = usePermission(PERMISSIONS.WORKFLOW_MANAGE)
  const canOpenAutomation = canManageAssistant || canManageWorkflows

  const flags = settings?.featureFlags as FeatureFlags | undefined
  // The org's own logo (resolved in brandingData by the root loader, same source
  // PortalBrandMark uses); fall back to the Quackback mark when none is set.
  const branding = (settings as { brandingData?: SettingsBrandingData } | undefined)?.brandingData
  const orgLogo = branding?.logoUrl ?? branding?.headerLogoUrl ?? '/logo.png'
  const orgName = branding?.name ?? 'Quackback'

  const railItems = buildRailItems(flags, canOpenAutomation)
  // Posts and comments waiting for review. Shown on Feedback when there are any.
  const feedbackEnabled = isProductEnabled(flags, 'feedback')
  const canReviewPosts = usePermission(PERMISSIONS.POST_APPROVE)
  const reviewEnabled = feedbackEnabled && canReviewPosts
  const { data: moderation } = useQuery({
    ...adminQueries.moderationStatus(),
    enabled: reviewEnabled,
  })
  const pendingModeration = reviewEnabled ? (moderation?.pendingCount ?? 0) : 0
  const itemBadge = (item: RailItem) =>
    item.href === '/admin/feedback' && pendingModeration > 0 ? pendingModeration : null
  const itemBadgeLabel = (item: RailItem) =>
    itemBadge(item) ? `${pendingModeration} waiting for review` : undefined
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const user = session?.user
  const name = user?.name ?? initialUserData?.name ?? null
  const email = user?.email ?? initialUserData?.email ?? null
  const avatarUrl = user?.image ?? initialUserData?.avatarUrl ?? null

  // Agent conversation availability (only meaningful when the support inbox is enabled).
  const conversationsEnabled = flags?.supportInbox ?? false
  const [availability, setAvailability] = useState<'online' | 'away'>(
    initialUserData?.chatAvailability ?? 'online'
  )
  const availabilityMutation = useMutation({
    mutationFn: (next: 'online' | 'away') =>
      setAgentAvailabilityFn({ data: { availability: next } }),
  })
  const setAvail = (next: 'online' | 'away') => {
    const prev = availability
    setAvailability(next) // optimistic
    availabilityMutation.mutate(next, { onError: () => setAvailability(prev) })
  }

  const handleSignOut = async () => {
    await signOut()
    router.invalidate()
    window.location.href = '/'
  }

  const siblingsQuery = useQuery({
    queryKey: ['admin', 'owner-workspaces'],
    queryFn: () => listOwnerWorkspacesFn(),
    enabled: Boolean(billingEnabled),
  })
  const siblings = siblingsQuery.data ?? []

  const openSibling = useMutation({
    mutationFn: (instanceId: string) => openOwnerWorkspaceFn({ data: { instanceId } }),
    onSuccess: ({ url }) => {
      window.location.assign(url)
    },
  })

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        data-admin-rail=""
        data-labeled={refined ? '' : undefined}
        className={cn('hidden shrink-0 flex-col sm:flex', refined ? 'w-56' : 'w-14')}
      >
        <ScrollArea className="h-full" scrollBarClassName="w-2" type="auto">
          <div className="flex h-full min-h-screen flex-col py-2">
            {/* Logo */}
            <Link
              to="/admin"
              className={cn(
                'mb-4 flex items-center opacity-90 transition-opacity hover:opacity-100',
                refined ? 'gap-2.5 px-4' : 'justify-center'
              )}
            >
              <img
                src={orgLogo}
                alt={orgName}
                width={28}
                height={28}
                className="h-7 w-7 rounded object-contain"
              />
              {refined ? <span className="truncate text-sm font-semibold">{orgName}</span> : null}
            </Link>

            {/* Main Navigation */}
            <nav className={cn('flex flex-col', refined ? 'gap-0.5 px-2' : 'items-center gap-2.5')}>
              {railItems.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  exact={item.exact}
                  badge={itemBadge(item)}
                  badgeLabel={itemBadgeLabel(item)}
                  labeled={refined}
                />
              ))}
            </nav>

            {/* Spacer */}
            <div className="min-h-3 flex-1" />

            {/* Bottom Section */}
            <div className={cn('flex flex-col', refined ? 'gap-0.5 px-2' : 'items-center gap-2.5')}>
              {/* Settings (admin-only) */}
              {isAdmin && (
                <NavItem
                  href="/admin/settings"
                  icon={Cog6ToothIcon}
                  label="Settings"
                  labeled={refined}
                />
              )}

              {billingEnabled && siblings.length > 0 ? (
                <WorkspaceSwitcher
                  siblings={siblings}
                  onOpen={(id) => openSibling.mutate(id)}
                  labeled={refined}
                />
              ) : null}

              {/* Notifications */}
              <NotificationBell
                className={refined ? undefined : 'size-9'}
                labeled={refined}
                active={onNotificationsPage}
              />

              {/* Portal Link */}
              {refined ? (
                <Link to="/" data-admin-rail-item="" className={railControlClass(true)}>
                  <GlobeAltIcon className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">View portal</span>
                </Link>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/"
                      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground/70 transition-all duration-200 hover:bg-muted/50 hover:text-foreground"
                    >
                      <GlobeAltIcon className="size-5" />
                      <span className="sr-only">View portal</span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    View portal
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Help Menu */}
              <DropdownMenu>
                {refined ? (
                  <DropdownMenuTrigger asChild>
                    <button
                      data-admin-rail-item=""
                      className={cn(
                        railControlClass(true),
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      )}
                    >
                      <QuestionMarkCircleIcon className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left">Help</span>
                      {latestVersion && (
                        <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground/70 transition-all duration-200 hover:bg-muted/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <QuestionMarkCircleIcon className="size-5" />
                          {latestVersion && (
                            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
                          )}
                          <span className="sr-only">Help</span>
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      Help
                    </TooltipContent>
                  </Tooltip>
                )}
                <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-52">
                  <DropdownMenuItem asChild>
                    <a
                      href="https://www.quackback.io/docs/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <BookOpenIcon className="mr-2 h-4 w-4" />
                      Documentation
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a
                      href="https://feedback.quackback.io/changelog"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <DocumentTextIcon className="mr-2 h-4 w-4" />
                      Changelog
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground/60">v{__APP_VERSION__}</span>
                    {latestVersion && (
                      <a
                        href={latestVersion.releaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        Update available · v{latestVersion.version}
                      </a>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User Menu */}
              <DropdownMenu>
                {refined ? (
                  <DropdownMenuTrigger asChild>
                    <button
                      data-admin-rail-item=""
                      className={cn(
                        railControlClass(true),
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      )}
                    >
                      <span className="relative shrink-0">
                        <Avatar className="size-6" src={avatarUrl} name={name} />
                        {conversationsEnabled && (
                          <span
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-background',
                              availability === 'online'
                                ? 'bg-green-500'
                                : 'border-2 border-muted-foreground bg-background'
                            )}
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left">{name || 'Account'}</span>
                    </button>
                  </DropdownMenuTrigger>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button className="relative flex size-9 items-center justify-center rounded-full transition-all duration-200 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <Avatar className="size-7" src={avatarUrl} name={name} />
                          {conversationsEnabled && (
                            <span
                              className={cn(
                                'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-background',
                                availability === 'online'
                                  ? 'bg-green-500'
                                  : 'border-2 border-muted-foreground bg-background'
                              )}
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      Account
                    </TooltipContent>
                  </Tooltip>
                )}
                <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 shrink-0" src={avatarUrl} name={name} />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground truncate">{email}</p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {conversationsEnabled && (
                    <AvailabilityMenuItems availability={availability} onSet={setAvail} />
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/settings">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </ScrollArea>
      </aside>

      {/* Mobile Header */}
      <header className="sm:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-4 border-b border-border/60 bg-card/95 backdrop-blur-sm">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Open menu">
              <Bars3Icon className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="px-5 pt-6 pb-4">
              <SheetTitle className="flex items-center gap-3">
                <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>
                  <img
                    src={orgLogo}
                    alt={orgName}
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded object-contain"
                  />
                </Link>
                <span className="text-base font-semibold">{orgName}</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1.5 px-4 py-3">
              {railItems.map((item) => (
                <MobileNavLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  exact={item.exact}
                  badge={itemBadge(item)}
                  badgeLabel={itemBadgeLabel(item)}
                  onClick={() => setMobileMenuOpen(false)}
                />
              ))}
              <div className="h-px bg-border/40 my-4" />
              {isAdmin && (
                <MobileNavLink
                  href="/admin/settings"
                  icon={Cog6ToothIcon}
                  label="Settings"
                  onClick={() => setMobileMenuOpen(false)}
                />
              )}
              {billingEnabled && siblings.length > 0
                ? siblings.map((sibling) => (
                    <button
                      key={sibling.instanceId}
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false)
                        openSibling.mutate(sibling.instanceId)
                      }}
                      className="flex flex-col items-start gap-0.5 px-4 py-3 rounded-lg text-sm text-muted-foreground/80 hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <span>{sibling.displayName}</span>
                      {friendlySiblingAddress(sibling.url) ? (
                        <span className="text-[11px]">{friendlySiblingAddress(sibling.url)}</span>
                      ) : null}
                    </button>
                  ))
                : null}
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-muted-foreground/80 hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <GlobeAltIcon className="h-5 w-5" />
                View portal
              </Link>
              <div className="h-px bg-border/40 my-4" />
              <a
                href="https://www.quackback.io/docs/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-muted-foreground/80 hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <BookOpenIcon className="h-5 w-5" />
                Documentation
              </a>
              <a
                href="https://feedback.quackback.io/changelog"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-muted-foreground/80 hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <DocumentTextIcon className="h-5 w-5" />
                Changelog
              </a>
              <div className="px-4 py-2 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground/50">v{__APP_VERSION__}</span>
                {latestVersion && (
                  <a
                    href={latestVersion.releaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Update available · v{latestVersion.version}
                  </a>
                )}
              </div>
            </nav>
          </SheetContent>
        </Sheet>

        <Link to="/admin" className="absolute left-1/2 -translate-x-1/2">
          <img
            src={orgLogo}
            alt={orgName}
            width={28}
            height={28}
            className="h-7 w-7 rounded object-contain"
          />
        </Link>

        <div className="flex items-center gap-1">
          <NotificationBell className="h-9 w-9" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative h-9 w-9 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar className="h-8 w-8" src={avatarUrl} name={name} />
                {conversationsEnabled && (
                  <span
                    className={cn(
                      'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-background',
                      availability === 'online'
                        ? 'bg-green-500'
                        : 'border-2 border-muted-foreground bg-background'
                    )}
                    aria-hidden="true"
                  />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8 shrink-0" src={avatarUrl} name={name} />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-xs text-muted-foreground truncate">{email}</p>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {conversationsEnabled && (
                <AvailabilityMenuItems availability={availability} onSet={setAvail} />
              )}
              <DropdownMenuItem asChild>
                <Link to="/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  )
}
