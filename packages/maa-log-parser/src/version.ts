import packageJson from '../package.json' with { type: 'json' }

export const PARSER_PACKAGE_NAME = packageJson.name
export const PARSER_PACKAGE_VERSION = packageJson.version
export const DEFAULT_PARSER_VERSION = `${PARSER_PACKAGE_NAME}/${PARSER_PACKAGE_VERSION}`
