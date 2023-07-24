import { PLUGIN_NAME, PLATFORM_NAME } from "./settings.js"
import MotionBlindsPlatform from "./platform.js"

export default (api) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, MotionBlindsPlatform)
}
