import contractIconUrl from '../assets/contract.webp'
import registryIconUrl from '../assets/registry.webp'

const presentation = {
  'contract-pheno': {
    iconUrl: contractIconUrl, accent: '#7468d5',
    entryUrl: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/contract`,
  },
  registry: {
    iconUrl: registryIconUrl, accent: '#7295bb',
    entryUrl: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/registry`,
  },
}

export function presentPlatform(platform) {
  return {
    accent: '#72978a',
    iconPath: 'M5 5h9v9H5Zm13 0h9v9h-9ZM5 18h9v9H5Zm13 0h9v9h-9Z',
    code: platform.code,
    name: platform.name,
    description: platform.description,
    admins: platform.admins,
    is_alive: platform.is_alive,
    ...presentation[platform.code],
  }
}
