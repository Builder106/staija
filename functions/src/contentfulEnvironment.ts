export function contentfulEnvironmentForProject(projectId: string | undefined): 'master' | 'staging' {
  if (projectId === 'staija') return 'master'
  if (projectId === 'staija-staging') return 'staging'
  throw new Error('Unknown Firebase project for LMS content.')
}
