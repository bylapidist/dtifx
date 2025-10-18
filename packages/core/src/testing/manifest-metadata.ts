import { readFile } from 'node:fs/promises';

export interface PackageJsonMetadata {
  readonly description?: string;
}

export const loadPackageDescription = async (packageJsonUrl: URL): Promise<string> => {
  const rawPackageJson = await readFile(packageJsonUrl, 'utf8');
  const packageJson = JSON.parse(rawPackageJson) as PackageJsonMetadata;

  if (!packageJson.description) {
    throw new Error(`Missing description in package.json at ${packageJsonUrl.pathname}`);
  }

  return packageJson.description;
};
