// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    className,
    ...rest
  }: {
    children: React.ReactNode
    to: string
    className?: string
  }) => (
    <a href={to} className={className} {...rest}>
      {children}
    </a>
  ),
}))

import { RowActions, RowDot, RowIcon, SettingsList, SettingsListRow } from '../settings-list'

afterEach(cleanup)

describe('SettingsListRow', () => {
  it('renders title, meta, badges and trailing content', () => {
    render(
      <SettingsList>
        <SettingsListRow
          title="Bug"
          meta="12 posts"
          badges={<span>Needs attention</span>}
          trailing={<span>42</span>}
        />
      </SettingsList>
    )
    expect(screen.getByText('Bug')).toBeTruthy()
    expect(screen.getByText('12 posts')).toBeTruthy()
    expect(screen.getByText('Needs attention')).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
  })

  it('is 52px with a meta line and 44px without', () => {
    render(
      <SettingsList>
        <SettingsListRow title="Two" meta="meta" />
        <SettingsListRow title="One" />
      </SettingsList>
    )
    const rows = document.querySelectorAll('[data-slot="settings-list-row"]')
    expect(rows[0].className).toContain('min-h-[52px]')
    expect(rows[1].className).toContain('min-h-[44px]')
  })

  it('a row with `to` is a whole-row link with a chevron and no menu', () => {
    render(
      <SettingsList>
        <SettingsListRow title="Email" to="/admin/settings/email" actions={[]} />
      </SettingsList>
    )
    const link = screen.getByRole('link', { name: /Email/ })
    expect(link.getAttribute('href')).toBe('/admin/settings/email')
    expect(link.querySelector('[data-slot="settings-list-chevron"]')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('calls onClick for a clickable row', () => {
    const onClick = vi.fn()
    render(
      <SettingsList>
        <SettingsListRow title="Pick me" onClick={onClick} />
      </SettingsList>
    )
    fireEvent.click(screen.getByText('Pick me'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders leading and grip slots', () => {
    render(
      <SettingsList>
        <SettingsListRow title="T" grip={<span>grip</span>} leading={<RowDot color="#ff0000" />} />
      </SettingsList>
    )
    expect(screen.getByText('grip')).toBeTruthy()
    expect(document.querySelector('[data-slot="row-dot"]')?.getAttribute('style')).toContain(
      '#ff0000'
    )
  })

  it('RowIcon renders its icon in a 32px tile', () => {
    render(<RowIcon icon={(p) => <svg data-testid="ic" {...p} />} />)
    const tile = screen.getByTestId('ic').parentElement
    expect(tile?.className).toContain('size-8')
  })
})

describe('RowActions', () => {
  it('labels the trigger and runs onSelect for the chosen item', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(
      <RowActions
        label="Bug"
        items={[
          { label: 'Edit', onSelect: onEdit },
          { label: 'Delete', onSelect: onDelete, destructive: true },
        ]}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Actions for Bug' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('styles a destructive item as destructive', async () => {
    const user = userEvent.setup()
    render(
      <RowActions
        label="Bug"
        items={[
          { label: 'Edit', onSelect: () => {} },
          { label: 'Delete', onSelect: () => {}, destructive: true },
        ]}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Actions for Bug' }))
    expect(screen.getByRole('menuitem', { name: 'Delete' }).getAttribute('data-variant')).toBe(
      'destructive'
    )
    expect(screen.getByRole('menuitem', { name: 'Edit' }).getAttribute('data-variant')).toBe(
      'default'
    )
  })

  it('does not run a disabled item', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<RowActions label="Bug" items={[{ label: 'Edit', onSelect, disabled: true }]} />)
    await user.click(screen.getByRole('button', { name: 'Actions for Bug' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('a row with actions renders the menu trigger', () => {
    render(
      <SettingsList>
        <SettingsListRow title="Bug" actions={[{ label: 'Edit', onSelect: () => {} }]} />
      </SettingsList>
    )
    expect(screen.getByRole('button', { name: 'Actions for Bug' })).toBeTruthy()
  })
})
