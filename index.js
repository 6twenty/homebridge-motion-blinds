import { PLATFORM_NAME } from "./settings.js"
import MotionBlindsPlatform from "./platform.js"

export default (api) => {
  // 2nd PLATFORM_NAME is the alias which is required for the schema to work
  api.registerPlatform(PLATFORM_NAME, PLATFORM_NAME, MotionBlindsPlatform)
}
