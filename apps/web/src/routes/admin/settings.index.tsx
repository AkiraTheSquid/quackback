'use client'

import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SettingsNav } from '@/components/admin/settings/settings-nav'
import { SettingsPage } from '@/components/admin/settings/settings-page'
import { useMediaQuery } from '@/lib/client/hooks/use-media-query'

export const Route = createFileRoute('/admin/settings/')({
  component: SettingsIndexPage,
})

function SettingsIndexPage() {
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // On desktop, redirect to General since the sidebar handles navigation
  useEffect(() => {
    if (isDesktop) {
      navigate({ to: '/admin/settings/general', replace: true })
    }
  }, [isDesktop, navigate])

  return (
    <div className="lg:hidden">
      <SettingsPage title="Settings" backLink={false}>
        <SettingsNav />
      </SettingsPage>
    </div>
  )
}
