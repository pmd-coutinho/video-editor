import { createProjectLibraryClient, type ProjectLibraryClient } from './client'

let library: ProjectLibraryClient | undefined

export function getProjectLibrary(): ProjectLibraryClient {
  library ??= createProjectLibraryClient()
  return library
}
