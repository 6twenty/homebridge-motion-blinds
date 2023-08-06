import { PLUGIN_VERSION, PLUGIN_NAME, PLATFORM_NAME } from "./settings.js"
import MotionBlindsAccessory from "./accessory.js"
import MotionAPI from "./api.js"

export default class MotionBlindsPlatform {
  constructor(log, _config, api) {
    this.log = log
    this.api = api
    this.accessories = []

    log.debug(`Version: ${PLUGIN_VERSION}`)

    api.on("didFinishLaunching", () => {
      this.discoverDevices()
    })
  }

  discoverDevices() {
    const motion = new MotionAPI(this.log)

    motion.on("device-added", (device) => {
      this.addDiscoveredDevice(device)
    })
  }

  /**
   * REQUIRED - Homebridge will call the "configureAccessory" method once for
   * every cached accessory restored
   */
  configureAccessory(accessory) {
    this.log("Loading accessory from cache:", accessory.displayName)

    this.accessories.push(accessory)
  }

  addDiscoveredDevice(device) {
    const uuid = this.api.hap.uuid.generate(device.mac)
    const existingAccessory = this.accessories.find((accessory) => {
      return accessory.UUID === uuid
    })

    if (existingAccessory) {
      this.log.info("Restoring existing accessory from cache:", existingAccessory.displayName)

      new MotionBlindsAccessory(this, existingAccessory, device)
    } else {
      const displayName = `Motion Blind ${device.mac}`

      this.log.info("Adding new accessory:", displayName)

      const accessory = new this.api.platformAccessory(displayName, uuid)

      this.accessories.push(accessory)

      new MotionBlindsAccessory(this, accessory, device)

      this.api.registerPlatformAccessories(
        PLUGIN_NAME, PLATFORM_NAME, [accessory]
      )
    }
  }
}
