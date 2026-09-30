import { Fragment } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/shared/utils'

/** A parent of the current page. Without `to` it is a module name with no page of its own. */
export interface PageCrumb {
  label: string
  to?: string
  params?: Record<string, string>
  search?: Record<string, unknown>
}

interface PageHeaderProps {
  title: string
  description?: string
  /** The parents of the current page, nearest to the root first. */
  crumbs?: PageCrumb[]
  /** Save feedback, rendered left of `actions`. */
  status?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  crumbs,
  status,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div data-page-header="" className={cn('space-y-1.5', className)}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px]">
          {crumbs.map((crumb) => (
            <Fragment key={`${crumb.to ?? ''}:${crumb.label}`}>
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  params={crumb.params}
                  search={crumb.search}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-muted-foreground">{crumb.label}</span>
              )}
              <span aria-hidden="true" className="text-muted-foreground/60">
                /
              </span>
            </Fragment>
          ))}
          <span aria-current="page" className="text-foreground">
            {title}
          </span>
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {(status || actions) && (
          <div className="flex shrink-0 items-center gap-3">
            {status}
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
