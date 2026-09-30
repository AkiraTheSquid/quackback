// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IntlProvider } from 'react-intl'
import { PerformanceStatRow } from '../performance-stat-row'

afterEach(cleanup)

function renderRow(stats: Parameters<typeof PerformanceStatRow>[0]['stats'], messages = {}) {
  return render(
    <IntlProvider locale="en" messages={messages} onError={() => {}}>
      <PerformanceStatRow stats={stats} />
    </IntlProvider>
  )
}

describe('PerformanceStatRow', () => {
  it('sets a missing value in quiet type, with the placeholder text translated', () => {
    renderRow([{ label: 'Involvement rate', value: null }], {
      'automation.performance.noData': 'Sin datos',
    })
    expect(screen.getByText('Sin datos')).toHaveAttribute('data-muted', 'true')
    expect(screen.queryByText('No data')).toBeNull()
  })

  it('reads No data when no translation is set', () => {
    renderRow([{ label: 'Involvement rate', value: null }])
    expect(screen.getByText('No data')).toHaveAttribute('data-muted', 'true')
  })

  it('keeps a figure in figure type, even when its text happens to read No data', () => {
    renderRow([{ label: 'Tag', value: 'No data' }])
    expect(screen.getByText('No data')).not.toHaveAttribute('data-muted')
  })
})
