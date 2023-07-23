import { PLATFORM_NAME } from "./settings.js"
import { MotionBlindsPlatform } from "./platform.js"

export default (api) => {
  api.registerPlatform(PLATFORM_NAME, MotionBlindsPlatform)
}
