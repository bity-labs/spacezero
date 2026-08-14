import type { ReactNode } from 'react'

export function AccountSettingsScreen({
  githubAccount
}: {
  githubAccount: ReactNode
}): React.JSX.Element {
  return (
    <>
      <h2 className="mb-6 text-xl font-medium">Account</h2>
      <div className="space-y-8">
        <section aria-labelledby="github-account-heading" className="space-y-3">
          <div className="px-2">
            <h3 id="github-account-heading" className="text-sm text-muted-foreground">
              GitHub
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              GitHub is optional. Local Projects continue to work without a connection.
            </p>
          </div>
          {githubAccount}
        </section>
      </div>
    </>
  )
}
