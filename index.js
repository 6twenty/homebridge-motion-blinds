import { PLATFORM_NAME } from "./settings"
import { MotionBlindsPlatform } from "./platform"

export default (api) => {
  api.registerPlatform(PLATFORM_NAME, MotionBlindsPlatform)
}
