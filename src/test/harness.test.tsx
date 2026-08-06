import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// Proves the jsdom environment and the jest-dom matchers are both wired up.
// Every component test in this plan fails for infrastructure reasons rather
// than for the behaviour it asserts if this file does not pass first.
it('renders a component and exposes jest-dom matchers', () => {
  render(<p>harness</p>)
  expect(screen.getByText('harness')).toBeInTheDocument()
})
