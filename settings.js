import { version } from "./package.json" assert { type: "json" }

/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = "MotionBlinds"

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = "homebridge-motion-blinds"

export const PLUGIN_VERSION = version
