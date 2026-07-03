import { render, screen } from '@testing-library/react'

import { App } from './App'

describe('App', () => {
  it('renders the Space Zero shell and health checks', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Space Zero' })).toBeInTheDocument()
    expect(await screen.findByTestId('ipc-version')).toHaveTextContent('0.0.0-test')
    expect(await screen.findByTestId('db-health')).toHaveTextContent('ready')
  })
})
