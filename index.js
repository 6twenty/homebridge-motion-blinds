import { PLATFORM_NAME, PLATFORM_ALIAS } from "./settings.js"
import MotionBlindsPlatform from "./platform.js"

export default (api) => {
  api.registerPlatform(PLATFORM_NAME, PLATFORM_ALIAS, MotionBlindsPlatform)
}
